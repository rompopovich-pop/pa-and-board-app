const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType,
  ShadingType, BorderStyle, AlignmentType, Header, Footer, PageNumber, PageBreak,
  HeadingLevel,
} = require("docx");
const c = require("./content.js");

const FONT = "Arial";
const W = 9638; // A4 width minus 2 cm margins each side (in DXA)
const DARK = "1A1A1A";
const LABEL = "EDEDED";
const border = { style: BorderStyle.SINGLE, size: 4, color: "9A9A9A" };
const borders = { top: border, bottom: border, left: border, right: border };

const p = (text, o = {}) => new Paragraph({
  spacing: { after: o.after ?? 100, before: o.before ?? 0 },
  alignment: o.align,
  children: [new TextRun({ text, bold: o.bold, size: o.size ?? 20, color: o.color, italics: o.italics, font: FONT })],
});

const cell = (text, width, o = {}) => new TableCell({
  borders,
  width: { size: width, type: WidthType.DXA },
  shading: o.fill ? { fill: o.fill, type: ShadingType.CLEAR, color: "auto" } : undefined,
  margins: { top: 80, bottom: 80, left: 110, right: 110 },
  columnSpan: o.span,
  children: (Array.isArray(text) ? text : [text]).map((t) =>
    p(t, { bold: o.bold, size: o.size ?? 19, color: o.color, after: 40 })),
});

const table = (widths, rows, o = {}) => new Table({
  width: { size: W, type: WidthType.DXA },
  columnWidths: widths,
  rows: rows.map((r, i) => new TableRow({
    tableHeader: o.header && i === 0,
    cantSplit: true,
    children: r.map((t, j) => {
      const isHead = o.header && i === 0;
      const isLabel = !isHead && o.labelCol && j === 0;
      return cell(t, widths[j], {
        fill: isHead ? DARK : isLabel ? LABEL : undefined,
        color: isHead ? "FFFFFF" : undefined,
        bold: isHead || isLabel,
      });
    }),
  })),
});

const section = (num, name, sub) => [
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    shading: { fill: DARK, type: ShadingType.CLEAR, color: "auto" },
    spacing: { before: 0, after: 80 },
    children: [new TextRun({ text: `  SECTION ${num} — ${name}`, font: FONT, bold: true, size: 30, color: "FFFFFF" })],
  }),
  p(sub, { italics: true, size: 19, color: "555555", after: 200 }),
];

const h2 = (t) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 240, after: 100 },
  keepNext: true,
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: DARK, space: 2 } },
  children: [new TextRun({ text: t, font: FONT, bold: true, size: 23 })],
});

const gap = () => p("", { after: 60 });
const br = () => new Paragraph({ children: [new PageBreak()] });

const children = [
  // Cover
  p("HULT INTERNATIONAL BUSINESS SCHOOL", { bold: true, size: 22, after: 600, before: 1200 }),
  p("Year Two", { size: 32, color: "555555", after: 60 }),
  p("Professional Development Plan", { bold: true, size: 56, after: 400 }),
  p("Know  ·  Grow  ·  Flow  ·  Reflect", { size: 24, color: "555555", after: 800 }),
  table([3000, W - 3000], c.cover, { labelCol: true }),
  br(),

  // SECTION 1
  ...section(1, "KNOW", "Where do I want to go? My ultimate career goal and the milestones on the way."),
  h2("My ultimate career goal"),
  table([W], [[c.goal]]),
  gap(),
  table([2400, W - 2400], c.glance, { labelCol: true }),
  h2("Career targets"),
  table([2900, W - 2900], [["Timeframe", "Target"], ...c.targets], { header: true, labelCol: true }),
  br(),

  // SECTION 2
  ...section(2, "GROW", "What do I already bring, what will the role demand, and what do I still need to develop?"),
  h2("My strengths"),
  table([2900, W - 2900], [["Strength", "Evidence"], ...c.strengths], { header: true, labelCol: true }),
  h2("Responsibilities of my target role (Founder / CEO)"),
  table([3300, W - 3300], [["Responsibility", "What it involves"], ...c.responsibilities], { header: true, labelCol: true }),
  h2("Skills I still need to develop"),
  table([3300, W - 3300], [["Skill gap", "Why it matters / where I am now"], ...c.gaps], { header: true, labelCol: true }),
  br(), h2("Networking: target organisations and people"),
  p(c.networkIntro, { size: 19, after: 120 }),
  table([1900, 2600, 2700, W - 7200],
    [["Category", "Target organisations", "People / contacts", "Purpose"], ...c.network],
    { header: true, labelCol: true }),
  br(),

  // SECTION 3
  ...section(3, "FLOW", "How will I get there? SMART development actions for the coming year."),
  ...c.actions.flatMap((a, i) => [
    h2(a.title),
    table([2300, W - 2300], a.rows, { labelCol: true }),
    ...(i === 1 ? [br()] : i < c.actions.length - 1 ? [gap()] : []),
  ]),
  br(),

  // SECTION 4
  ...section(4, "REFLECTION & SUMMARY", "Each reflection is 150 words or fewer."),
  ...c.reflections.flatMap(([q, a]) => [h2(q), table([W], [[a]])]),
];

const doc = new Document({
  creator: "Rom Popovich",
  title: "Year Two Professional Development Plan — Rom Popovich",
  styles: {
    default: { document: { run: { font: FONT, size: 20 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 30, bold: true }, paragraph: { spacing: { before: 0, after: 80 }, keepNext: true, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 23, bold: true }, paragraph: { spacing: { before: 240, after: 100 }, keepNext: true, outlineLevel: 1 } },
    ],
  },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: "Hult International Business School  |  Year Two PDP  |  Rom Popovich", font: FONT, size: 16, color: "777777" })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: "777777" })] })] }) },
    children,
  }],
});

Packer.toBuffer(doc).then((b) => {
  fs.writeFileSync("Rom_Popovich_Professional_Development_Plan_2026.docx", b);
  console.log("written");
});
