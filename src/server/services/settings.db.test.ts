import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { actorOf, addMember, createTag, createUser } from "@/server/db/fixtures";
import { auditLog, issues, tags } from "@/server/db/schema";
import { getTestDb, truncateAll } from "@/server/db/testing";
import {
  type FieldRow,
  readColumns,
  readIssueTypes,
  readPresets,
  readProcedures,
} from "@/server/queries/settings";
import { ForbiddenError, ValidationError } from "./errors";
import { createProject } from "./projects";
import { saveColumns, saveIssueTypes, savePresets, saveProcedures } from "./settings";

const db = getTestDb();

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => expect.fail("expected the call to fail"),
    (e: unknown) => e,
  );
}

async function setup() {
  const owner = actorOf(await createUser(db));
  const project = await createProject(
    owner,
    {
      clientName: "ACME",
      code: `S-${crypto.randomUUID().slice(0, 6)}`,
      description: "",
      fieldStartDate: "2026-10-01",
      timezone: "UTC",
      dateFormat: "YYYY/MM/DD",
    },
    { db },
  );
  return { owner, project };
}

/** The Columns form as the client would send it, after `edit`. */
async function columnsInput(
  projectId: string,
  edit: (fields: (Partial<FieldRow> & { tempId?: string })[]) => void = () => {},
  extra: { deletedIds?: string[]; primaryGroup?: string | null } = {},
) {
  const state = await readColumns(db, projectId);
  const fields: (Partial<FieldRow> & { tempId?: string })[] = state.fields.map((f) => ({ ...f }));
  edit(fields);
  return {
    token: state.token,
    fields,
    deletedIds: extra.deletedIds ?? [],
    primaryGroup:
      extra.primaryGroup !== undefined
        ? extra.primaryGroup
        : (state.fields.find((f) => f.key === state.primaryGroupFieldKey)?.id ?? null),
  };
}

const newColumn = (label: string, dataType = "text") => ({
  tempId: `new-${label}`,
  label,
  dataType: dataType as FieldRow["dataType"],
  required: false,
  groupable: true,
  testRelevant: false,
  showInIoList: true,
  showInLoopCheck: true,
});

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await db.$client.end();
});

describe("saveColumns (REQ-SET-03)", () => {
  it("renames, reorders, toggles and adds columns, auditing only the changes", async () => {
    const { owner, project } = await setup();
    const input = await columnsInput(project.id, (fields) => {
      fields.find((f) => f.key === "loop")!.label = "Loop #";
      fields.find((f) => f.key === "pid")!.showInLoopCheck = false;
      fields.reverse();
      fields.push(newColumn("Équipment"));
    });

    await saveColumns(owner, project.id, { ...input, primaryGroup: "new-Équipment" }, { db });

    const after = await readColumns(db, project.id);
    expect(after.fields.map((f) => f.key).slice(0, 2)).toEqual(["unit", "range_max"]);
    expect(after.fields.at(-1)).toMatchObject({ key: "equipment", source: "attribute" });
    expect(after.fields.find((f) => f.key === "loop")?.label).toBe("Loop #");
    expect(after.primaryGroupFieldKey).toBe("equipment");

    const log = await db.select().from(auditLog).where(eq(auditLog.projectId, project.id));
    const settings = log.filter((e) => e.action.startsWith("settings."));
    expect(new Set(settings.map((e) => e.batchId)).size).toBe(1);
    const loop = settings.find(
      (e) => e.action === "settings.field_update" && e.after?.label === "Loop #",
    );
    expect(loop?.before).toMatchObject({ label: "Loop" });
    expect(settings.map((e) => e.action)).toContain("settings.field_create");
    expect(settings.map((e) => e.action)).toContain("settings.primary_group");
  });

  it("keeps Tag, Description and IO type required and built-in types fixed", async () => {
    const { owner, project } = await setup();

    await saveColumns(
      owner,
      project.id,
      await columnsInput(project.id, (fields) => {
        fields.find((f) => f.key === "tag")!.required = false;
        fields.find((f) => f.key === "unit")!.required = true;
      }),
      { db },
    );
    const { fields } = await readColumns(db, project.id);
    expect(fields.find((f) => f.key === "tag")?.required).toBe(true);
    expect(fields.find((f) => f.key === "unit")?.required).toBe(true);

    const typeChange = await rejection(
      saveColumns(
        owner,
        project.id,
        await columnsInput(project.id, (f) => {
          f.find((x) => x.key === "range_min")!.dataType = "text";
        }),
        { db },
      ),
    );
    expect((typeChange as Error).message).toBe("The data type of “Range min” cannot change.");
  });

  it("converts attribute values when the type changes, or lists the tags that do not convert", async () => {
    const { owner, project } = await setup();
    await saveColumns(
      owner,
      project.id,
      await columnsInput(project.id, (f) => f.push(newColumn("Rack"))),
      { db },
    );
    const ok = await createTag(db, project.id, { tag: "PT-1", attributes: { rack: " 12 " } });
    const bad = await createTag(db, project.id, { tag: "PT-2", attributes: { rack: "A3" } });

    const refused = await rejection(
      saveColumns(
        owner,
        project.id,
        await columnsInput(project.id, (f) => {
          f.find((x) => x.key === "rack")!.dataType = "number";
        }),
        { db },
      ),
    );
    expect((refused as Error).message).toContain("1 tag(s) have values that do not convert (PT-2)");

    await db
      .update(tags)
      .set({ attributes: { rack: "7" } })
      .where(eq(tags.id, bad.id));
    await saveColumns(
      owner,
      project.id,
      await columnsInput(project.id, (f) => {
        f.find((x) => x.key === "rack")!.dataType = "number";
      }),
      { db },
    );
    const rows = await db.select().from(tags).where(eq(tags.projectId, project.id));
    const byTag = Object.fromEntries(rows.map((r) => [r.tag, r]));
    expect(byTag["PT-1"]).toMatchObject({ attributes: { rack: 12 }, version: ok.version + 1 });
    expect(byTag["PT-2"].attributes).toEqual({ rack: 7 });
  });

  it("removes attribute columns only while no tag has a value", async () => {
    const { owner, project } = await setup();
    await saveColumns(
      owner,
      project.id,
      await columnsInput(project.id, (f) => f.push(newColumn("Panel"), newColumn("Spare"))),
      { db },
    );
    await createTag(db, project.id, { attributes: { panel: "P-01", spare: "" } });
    const { fields } = await readColumns(db, project.id);
    const id = (key: string) => fields.find((f) => f.key === key)!.id;
    const without = (key: string) =>
      columnsInput(
        project.id,
        (f) =>
          f.splice(
            f.findIndex((x) => x.key === key),
            1,
          ),
        {
          deletedIds: [id(key)],
        },
      );

    await expect(saveColumns(owner, project.id, await without("panel"), { db })).rejects.toThrow(
      "has values in 1 tag(s)",
    );
    await expect(saveColumns(owner, project.id, await without("tag"), { db })).rejects.toThrow(
      "built-in column",
    );
    await saveColumns(owner, project.id, await without("spare"), { db });
    expect((await readColumns(db, project.id)).fields.some((f) => f.key === "spare")).toBe(false);
  });

  it("needs a groupable primary grouping and unique labels", async () => {
    const { owner, project } = await setup();
    const { fields } = await readColumns(db, project.id);
    const loop = fields.find((f) => f.key === "loop")!;

    await expect(
      saveColumns(
        owner,
        project.id,
        await columnsInput(project.id, () => {}, { primaryGroup: loop.id }),
        {
          db,
        },
      ),
    ).rejects.toThrow("must be groupable");
    await expect(
      saveColumns(
        owner,
        project.id,
        await columnsInput(project.id, (f) => {
          f.find((x) => x.key === "unit")!.label = "loop";
        }),
        { db },
      ),
    ).rejects.toThrow("Two columns are called");
  });

  it("refuses a save based on stale data, and a save with no change", async () => {
    const { owner, project } = await setup();
    const stale = await columnsInput(project.id, (f) => {
      f[0].label = "Instrument tag";
    });
    await saveColumns(
      owner,
      project.id,
      await columnsInput(project.id, (f) => {
        f[1].label = "Service";
      }),
      { db },
    );

    await expect(saveColumns(owner, project.id, stale, { db })).rejects.toThrow(
      "Someone else changed these settings meanwhile.",
    );
    await expect(
      saveColumns(owner, project.id, await columnsInput(project.id), { db }),
    ).rejects.toThrow("Nothing to save.");
  });

  it("is for owners and members, not viewers (REQ-PERM-01)", async () => {
    const { project } = await setup();
    const member = actorOf(await createUser(db));
    const viewer = actorOf(await createUser(db));
    await addMember(db, project.id, member.userId, "member");
    await addMember(db, project.id, viewer.userId, "viewer");
    const input = await columnsInput(project.id, (f) => {
      f[0].label = "TAG";
    });

    await expect(saveColumns(viewer, project.id, input, { db })).rejects.toThrow(ForbiddenError);
    await saveColumns(member, project.id, input, { db });
  });
});

describe("saveIssueTypes (REQ-SET-04)", () => {
  async function typesInput(
    projectId: string,
    edit: (types: { id?: string; tempId?: string; name: string; archived: boolean }[]) => void,
  ) {
    const state = await readIssueTypes(db, projectId);
    const types = state.types.map((t) => ({ ...t }));
    edit(types);
    return { token: state.token, types };
  }

  it("adds, renames, reorders and archives types; archived ones stay on old issues", async () => {
    const { owner, project } = await setup();
    const [field] = (await readIssueTypes(db, project.id)).types;
    const tag = await createTag(db, project.id);
    await db.insert(issues).values({
      projectId: project.id,
      tagId: tag.id,
      issueTypeId: field.id,
      description: "Loose wire",
      openedBy: owner.userId,
      updatedBy: owner.userId,
    });

    await saveIssueTypes(
      owner,
      project.id,
      await typesInput(project.id, (types) => {
        types[0].archived = true;
        types[1].name = "Cabling";
        types.reverse();
        types.push({ tempId: "n1", name: "Mechanical", archived: false });
      }),
      { db },
    );

    const { types } = await readIssueTypes(db, project.id);
    expect(types.map((t) => [t.name, t.archived])).toEqual([
      ["Other", false],
      ["Logic", false],
      ["Cabling", false],
      ["Field", true],
      ["Mechanical", false],
    ]);
    const [issue] = await db.select().from(issues);
    expect(issue.issueTypeId).toBe(field.id);
  });

  it("keeps names unique and at least one type active", async () => {
    const { owner, project } = await setup();

    await expect(
      saveIssueTypes(
        owner,
        project.id,
        await typesInput(project.id, (t) => {
          t[1].name = "field";
        }),
        { db },
      ),
    ).rejects.toThrow("Two issue types are called");
    await expect(
      saveIssueTypes(
        owner,
        project.id,
        await typesInput(project.id, (t) => t.forEach((x) => (x.archived = true))),
        { db },
      ),
    ).rejects.toThrow("Keep at least one active issue type.");
  });
});

describe("savePresets (REQ-SET-05)", () => {
  it("adds, edits, reorders and removes presets", async () => {
    const { owner, project } = await setup();
    const { types } = await readIssueTypes(db, project.id);
    let state = await readPresets(db, project.id);

    await savePresets(
      owner,
      project.id,
      {
        token: state.token,
        presets: [
          { tempId: "a", issueTypeId: types[0].id, text: "Loose terminal" },
          { tempId: "b", issueTypeId: types[1].id, text: "Wrong range in DCS" },
        ],
        deletedIds: [],
      },
      { db },
    );
    state = await readPresets(db, project.id);
    expect(state.presets.map((p) => p.text)).toEqual(["Loose terminal", "Wrong range in DCS"]);

    const [first, second] = state.presets;
    await savePresets(
      owner,
      project.id,
      {
        token: state.token,
        presets: [{ ...second, text: "Wrong range in the DCS" }],
        deletedIds: [first.id],
      },
      { db },
    );
    expect((await readPresets(db, project.id)).presets).toEqual([
      { id: second.id, issueTypeId: types[1].id, text: "Wrong range in the DCS" },
    ]);
  });

  it("only accepts the project's issue types", async () => {
    const { owner, project } = await setup();
    const other = await setup();
    const [foreign] = (await readIssueTypes(db, other.project.id)).types;
    const state = await readPresets(db, project.id);

    await expect(
      savePresets(
        owner,
        project.id,
        {
          token: state.token,
          presets: [{ tempId: "x", issueTypeId: foreign.id, text: "x" }],
          deletedIds: [],
        },
        { db },
      ),
    ).rejects.toThrow(ValidationError);
  });
});

describe("saveProcedures (REQ-SET-06)", () => {
  it("one text per IO type in the IO list; saved texts of other types stay visible", async () => {
    const { owner, project } = await setup();
    await createTag(db, project.id, { ioType: "AI" });
    await createTag(db, project.id, { ioType: "DO" });
    await createTag(db, project.id, { ioType: "RTD", listStatus: "removed" });
    let state = await readProcedures(db, project.id);
    expect(state.procedures.map((p) => p.ioType)).toEqual(["AI", "DO"]);

    await saveProcedures(
      owner,
      project.id,
      { token: state.token, procedures: { ai: "Inject 4, 12 and 20 mA.", DO: "" } },
      { db },
    );
    state = await readProcedures(db, project.id);
    expect(state.procedures.find((p) => p.ioType === "AI")).toMatchObject({
      text: "Inject 4, 12 and 20 mA.",
      updatedBy: expect.any(String),
    });

    // AI leaves the IO list: its text is kept and flagged
    await db.update(tags).set({ listStatus: "removed" }).where(eq(tags.ioType, "AI"));
    state = await readProcedures(db, project.id);
    expect(state.procedures.find((p) => p.ioType === "AI")).toMatchObject({ inIoList: false });

    // Clearing the text removes the procedure
    await saveProcedures(owner, project.id, { token: state.token, procedures: { AI: "" } }, { db });
    expect((await readProcedures(db, project.id)).procedures.map((p) => p.ioType)).toEqual(["DO"]);
    const actions = (await db.select().from(auditLog)).map((e) => e.action);
    expect(actions.filter((a) => a === "settings.procedure_update")).toHaveLength(2);
  });
});
