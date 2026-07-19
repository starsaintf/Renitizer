"""Private sanitization for Office Open XML packages (.docx, .xlsx, .pptx)."""

from pathlib import Path
import argparse
import zipfile
import xml.etree.ElementTree as ET


MAX_ENTRIES = 10_000
MAX_UNCOMPRESSED_BYTES = 500 * 1024 * 1024
WORD_NS = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
UNWRAP_REVISIONS = {WORD_NS + tag for tag in ('ins', 'moveTo')}
REMOVE_REVISIONS = {WORD_NS + tag for tag in ('del', 'moveFrom', 'moveFromRangeStart', 'moveFromRangeEnd', 'moveToRangeStart', 'moveToRangeEnd')}


def sanitize_office(source, output):
    """Write an Office package without common private document structures."""
    source = Path(source)
    output = Path(output)
    removed = set()
    with zipfile.ZipFile(source, 'r') as input_archive:
        entries = input_archive.infolist()
        _validate_archive(entries)
        with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as output_archive:
            for entry in entries:
                reason = _private_part_reason(entry.filename)
                if reason:
                    removed.add(reason)
                    continue
                content = input_archive.read(entry.filename)
                if _is_word_xml(entry.filename):
                    content, changed = _remove_word_revisions(content)
                    if changed:
                        removed.add('revisions')
                if entry.filename.lower().endswith('.rels'):
                    content, changed = _remove_private_relationships(content)
                    if changed:
                        removed.update({'comments', 'embedded-fonts', 'embedded-objects', 'signatures'})
                output_archive.writestr(entry.filename, content)
    return {'removed': sorted(removed)}


def _validate_archive(entries):
    if len(entries) > MAX_ENTRIES:
        raise ValueError('Office package contains too many entries.')
    if sum(entry.file_size for entry in entries) > MAX_UNCOMPRESSED_BYTES:
        raise ValueError('Office package is too large after decompression.')


def _private_part_reason(name):
    path = name.replace('\\', '/').lower()
    if path.startswith('docprops/'):
        return 'thumbnails' if 'thumbnail' in path else 'document-properties'
    if path.startswith('_xmlsignatures/') or '_xmlsignatures/' in path:
        return 'signatures'
    if any(segment in path for segment in ('/comments', '/commentauthors', '/threadedcomments', '/persons/', '/people.xml')):
        return 'comments'
    if any(segment in path for segment in ('/fonts/', '/fonttable')):
        return 'embedded-fonts'
    if any(segment in path for segment in ('/embeddings/', '/activex/', '/customxml/', 'vbaproject.bin')):
        return 'embedded-objects'
    return None


def _is_word_xml(name):
    path = name.replace('\\', '/').lower()
    return path.startswith('word/') and path.endswith('.xml') and '/_rels/' not in path


def _remove_word_revisions(content):
    try:
        root = ET.fromstring(content)
    except ET.ParseError:
        return content, False
    changed = _rewrite_revisions(root)
    if not changed:
        return content, False
    return ET.tostring(root, encoding='utf-8', xml_declaration=True), True


def _rewrite_revisions(parent):
    changed = False
    for child in list(parent):
        if child.tag in REMOVE_REVISIONS:
            parent.remove(child)
            changed = True
            continue
        if child.tag in UNWRAP_REVISIONS:
            index = list(parent).index(child)
            children = list(child)
            parent.remove(child)
            for offset, grandchild in enumerate(children):
                parent.insert(index + offset, grandchild)
            changed = True
            continue
        changed = _rewrite_revisions(child) or changed
    return changed


def _remove_private_relationships(content):
    try:
        root = ET.fromstring(content)
    except ET.ParseError:
        return content, False
    removed = False
    private_tokens = ('comment', 'person', 'people', 'customxml', 'font', 'embedding', 'activex', 'signature', 'vba')
    for relationship in list(root):
        description = f"{relationship.attrib.get('Type', '')} {relationship.attrib.get('Target', '')}".lower()
        if any(token in description for token in private_tokens):
            root.remove(relationship)
            removed = True
    return (ET.tostring(root, encoding='utf-8', xml_declaration=True), True) if removed else (content, False)


def main():
    parser = argparse.ArgumentParser(description='Remove private structures from an Office Open XML package.')
    parser.add_argument('source')
    parser.add_argument('output')
    args = parser.parse_args()
    sanitize_office(args.source, args.output)


if __name__ == '__main__':
    main()
