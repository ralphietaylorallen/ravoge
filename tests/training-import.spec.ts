import { expect, test } from "@playwright/test";
import { strToU8, zipSync } from "fflate";

import { parseTrainingHistoryFile } from "../lib/training-import";

function createTestXlsx() {
  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="History" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Exercise</t></is></c><c r="B1" t="inlineStr"><is><t>Sets</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Back Squat</t></is></c><c r="B2"><v>5</v></c></row></sheetData></worksheet>`,
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, value]) => [name, strToU8(value)])));
}

test.describe("workout-history parsing", () => {
  test("preserves CSV source values for preview and import", async () => {
    const file = new File(["Exercise,Sets,Load\nBack Squat,5,225\nBench Press,3,185\n"], "history.csv", { type: "text/csv" });
    const parsed = await parseTrainingHistoryFile(file);

    expect(parsed.format).toBe("csv");
    expect(parsed.headers).toEqual(["Exercise", "Sets", "Load"]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].cells.map((cell) => cell.raw)).toEqual(["Back Squat", "5", "225"]);
  });

  test("parses XLSX source values", async () => {
    const file = new File([createTestXlsx()], "history.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const parsed = await parseTrainingHistoryFile(file);

    expect(parsed.format).toBe("xlsx");
    expect(parsed.headers).toEqual(["Exercise", "Sets"]);
    expect(parsed.rows[0].cells.map((cell) => cell.raw)).toEqual(["Back Squat", 5]);
  });
});
