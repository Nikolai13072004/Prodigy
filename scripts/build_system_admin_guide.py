from __future__ import annotations

import html
import re
import struct
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path("/home/team-02/lms-course3")
SOURCE = ROOT / "docs" / "aurora-lms-system-admin-guide.md"
DOCX_OUTPUT = ROOT / "docs" / "aurora-lms-system-admin-guide.docx"
HTML_OUTPUT = ROOT / "tmp" / "aurora-lms-system-admin-guide.html"

IMAGE_RE = re.compile(r"^!\[(?P<alt>.*?)\]\((?P<path>.+?)\)\s*$")
ORDERED_RE = re.compile(r"^\d+\.\s+(?P<text>.*)$")
UNORDERED_RE = re.compile(r"^-\s+(?P<text>.*)$")


@dataclass
class Item:
    kind: str
    text: str = ""
    level: int = 0
    path: Path | None = None
    alt: str = ""


def clean_inline_markdown(text: str) -> str:
    text = text.replace("`", "")
    text = re.sub(r"\*\*(.*?)\*\*", r"\1", text)
    text = re.sub(r"\*(.*?)\*", r"\1", text)
    return text.strip()


def parse_markdown() -> list[Item]:
    items: list[Item] = []

    for raw_line in SOURCE.read_text(encoding="utf-8").splitlines():
        stripped = raw_line.strip()
        if not stripped:
            continue

        image_match = IMAGE_RE.match(stripped)
        if image_match:
            image_path = (SOURCE.parent / image_match.group("path")).resolve()
            items.append(Item(kind="image", path=image_path, alt=image_match.group("alt")))
            continue

        if stripped.startswith("#"):
            level = len(stripped) - len(stripped.lstrip("#"))
            text = stripped[level:].strip()
            items.append(Item(kind="heading", text=clean_inline_markdown(text), level=level))
            continue

        if stripped.startswith(">"):
            items.append(Item(kind="note", text=clean_inline_markdown(stripped.lstrip("> "))))
            continue

        ordered_match = ORDERED_RE.match(stripped)
        if ordered_match:
            items.append(Item(kind="numbered", text=clean_inline_markdown(ordered_match.group("text"))))
            continue

        unordered_match = UNORDERED_RE.match(stripped)
        if unordered_match:
            items.append(Item(kind="bullet", text=clean_inline_markdown(unordered_match.group("text"))))
            continue

        items.append(Item(kind="paragraph", text=clean_inline_markdown(stripped)))

    return items


def xml_escape(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def docx_run(text: str, bold: bool = False, italic: bool = False) -> str:
    props = ""
    if bold or italic:
        props = "<w:rPr>"
        if bold:
            props += "<w:b/>"
        if italic:
            props += "<w:i/>"
        props += "</w:rPr>"
    return f"<w:r>{props}<w:t>{xml_escape(text)}</w:t></w:r>"


def docx_paragraph(text: str, style: str = "Normal", bold: bool = False, italic: bool = False) -> str:
    ppr = f'<w:pPr><w:pStyle w:val="{style}"/></w:pPr>' if style else ""
    return f"<w:p>{ppr}{docx_run(text, bold=bold, italic=italic)}</w:p>"


def image_size(path: Path) -> tuple[int, int]:
    data = path.read_bytes()

    if data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 24:
        return struct.unpack(">II", data[16:24])

    if data.startswith(b"\xff\xd8"):
        index = 2
        while index + 9 < len(data):
            if data[index] != 0xFF:
                index += 1
                continue
            marker = data[index + 1]
            index += 2
            if marker in {0xD8, 0xD9}:
                continue
            if index + 2 > len(data):
                break
            length = struct.unpack(">H", data[index : index + 2])[0]
            if marker in {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}:
                height = struct.unpack(">H", data[index + 3 : index + 5])[0]
                width = struct.unpack(">H", data[index + 5 : index + 7])[0]
                return width, height
            index += length

    return 1200, 700


def docx_image(rid: str, name: str, path: Path) -> str:
    width_px, height_px = image_size(path)
    max_width_emu = int(6.5 * 914400)
    width_emu = max_width_emu
    height_emu = int(max_width_emu * height_px / max(width_px, 1))

    return f"""
<w:p>
  <w:pPr><w:jc w:val="center"/></w:pPr>
  <w:r>
    <w:drawing>
      <wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
        <wp:extent cx="{width_emu}" cy="{height_emu}"/>
        <wp:docPr id="{rid[3:]}" name="{xml_escape(name)}"/>
        <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:nvPicPr>
                <pic:cNvPr id="0" name="{xml_escape(name)}"/>
                <pic:cNvPicPr/>
              </pic:nvPicPr>
              <pic:blipFill>
                <a:blip r:embed="{rid}"/>
                <a:stretch><a:fillRect/></a:stretch>
              </pic:blipFill>
              <pic:spPr>
                <a:xfrm>
                  <a:off x="0" y="0"/>
                  <a:ext cx="{width_emu}" cy="{height_emu}"/>
                </a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
              </pic:spPr>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing>
  </w:r>
</w:p>"""


def document_title(items: list[Item]) -> str:
    for item in items:
        if item.kind == "heading" and item.level == 1 and item.text:
            return item.text
    return SOURCE.stem


def build_docx(items: list[Item]) -> None:
    title = document_title(items)
    body: list[str] = []
    rels = ['<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>']
    media: list[tuple[str, Path]] = []
    image_index = 1

    for item in items:
        if item.kind == "heading":
            if item.level == 1:
                body.append(docx_paragraph(item.text, "Title"))
            elif item.level == 2:
                body.append(docx_paragraph(item.text, "Heading1"))
            else:
                body.append(docx_paragraph(item.text, "Heading2"))
        elif item.kind == "bullet":
            body.append(docx_paragraph("• " + item.text, "ListParagraph"))
        elif item.kind == "numbered":
            body.append(docx_paragraph(item.text, "ListParagraph"))
        elif item.kind == "note":
            body.append(docx_paragraph(item.text, "Quote", italic=True))
        elif item.kind == "image" and item.path is not None:
            if item.path.exists():
                suffix = item.path.suffix.lower().lstrip(".")
                if suffix == "jpg":
                    suffix = "jpeg"
                target = f"media/image{image_index}.{suffix}"
                rid = f"rId{image_index + 1}"
                rels.append(
                    f'<Relationship Id="{rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="{target}"/>'
                )
                media.append((target, item.path))
                body.append(docx_image(rid, item.path.name, item.path))
                if item.alt:
                    body.append(docx_paragraph(item.alt, "Caption", italic=True))
                image_index += 1
            else:
                body.append(docx_paragraph(f"[Изображение не найдено: {item.path.name}]", "Quote", italic=True))
        else:
            body.append(docx_paragraph(item.text))

    document_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    {''.join(body)}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>"""

    styles_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="320" w:after="160"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="220" w:after="120"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="360" w:hanging="180"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="360"/><w:spacing w:before="80" w:after="120"/></w:pPr><w:rPr><w:i/><w:color w:val="555555"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="Caption"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="160"/></w:pPr><w:rPr><w:i/><w:color w:val="555555"/><w:sz w:val="20"/></w:rPr></w:style>
</w:styles>"""

    doc_rels = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  {''.join(rels)}
</Relationships>"""

    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    core = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>{xml_escape(title)}</dc:title>
  <dc:creator>Codex</dc:creator>
  <cp:lastModifiedBy>Codex</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">{now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">{now}</dcterms:modified>
</cp:coreProperties>"""

    app = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Codex</Application>
</Properties>"""

    content_types = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>"""

    rels_root = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>"""

    with zipfile.ZipFile(DOCX_OUTPUT, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", rels_root)
        archive.writestr("word/document.xml", document_xml)
        archive.writestr("word/styles.xml", styles_xml)
        archive.writestr("word/_rels/document.xml.rels", doc_rels)
        archive.writestr("docProps/core.xml", core)
        archive.writestr("docProps/app.xml", app)
        for target, path in media:
            archive.write(path, f"word/{target}")


def build_html(items: list[Item]) -> None:
    title = document_title(items)
    chunks = [
        "<!doctype html><html lang=\"ru\"><head><meta charset=\"utf-8\">",
        f"<title>{html.escape(title)}</title>",
        """
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: Arial, sans-serif; font-size: 14px; line-height: 1.45; color: #172033; }
  h1 { font-size: 30px; margin: 0 0 18px; }
  h2 { font-size: 22px; margin: 28px 0 10px; page-break-after: avoid; color: #10203d; }
  p { margin: 0 0 9px; }
  ul, ol { margin: 0 0 10px 22px; padding: 0; }
  li { margin: 0 0 5px; }
  blockquote { margin: 10px 0 14px; padding: 9px 12px; border-left: 4px solid #4c6fff; background: #f4f6fb; color: #34405c; }
  figure { margin: 16px 0 22px; page-break-inside: avoid; }
  img { display: block; max-width: 100%; border: 1px solid #d7dcea; border-radius: 6px; }
  figcaption { text-align: center; color: #667085; font-style: italic; margin-top: 6px; }
</style></head><body>
""",
    ]

    list_type: str | None = None

    def close_list() -> None:
        nonlocal list_type
        if list_type:
            chunks.append(f"</{list_type}>")
            list_type = None

    for item in items:
        if item.kind in {"bullet", "numbered"}:
            wanted = "ul" if item.kind == "bullet" else "ol"
            if list_type != wanted:
                close_list()
                chunks.append(f"<{wanted}>")
                list_type = wanted
            chunks.append(f"<li>{html.escape(item.text)}</li>")
            continue

        close_list()
        if item.kind == "heading":
            level = 1 if item.level == 1 else 2
            chunks.append(f"<h{level}>{html.escape(item.text)}</h{level}>")
        elif item.kind == "note":
            chunks.append(f"<blockquote>{html.escape(item.text)}</blockquote>")
        elif item.kind == "image" and item.path is not None:
            src = item.path.as_uri() if item.path.exists() else item.path.as_posix()
            chunks.append(f"<figure><img src=\"{html.escape(src)}\" alt=\"{html.escape(item.alt)}\"><figcaption>{html.escape(item.alt)}</figcaption></figure>")
        else:
            chunks.append(f"<p>{html.escape(item.text)}</p>")

    close_list()
    chunks.append("</body></html>")
    HTML_OUTPUT.write_text("\n".join(chunks), encoding="utf-8")


def main() -> None:
    global SOURCE, DOCX_OUTPUT, HTML_OUTPUT
    import sys

    if len(sys.argv) >= 2:
        SOURCE = Path(sys.argv[1]).resolve()
        DOCX_OUTPUT = SOURCE.with_suffix(".docx")
        HTML_OUTPUT = ROOT / "tmp" / f"{SOURCE.stem}.html"

    items = parse_markdown()
    build_docx(items)
    build_html(items)
    print(DOCX_OUTPUT)
    print(HTML_OUTPUT)


if __name__ == "__main__":
    main()
