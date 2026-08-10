"""Private sanitization for Office Open XML packages (.docx, .xlsx, .pptx)."""

from pathlib import Path
import argparse
import json
import zipfile
import xml.etree.ElementTree as ET


MAX_ENTRIES = 10_000
MAX_UNCOMPRESSED_BYTES = 500 * 1024 * 1024
WORD_NS = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
UNWRAP_REVISIONS = {WORD_NS + tag for tag in ('ins', 'moveTo')}
REMOVE_REVISIONS = {WORD_NS + tag for tag in ('del', 'moveFrom', 'moveFromRangeStart', 'moveFromRangeEnd', 'moveToRangeStart', 'moveToRangeEnd')}
CATEGORY_REASONS = {
    'metadata': {'document-properties'},
    'comment': {'comments'},
    'revision': {'revisions'},
    'hidden-object': {'embedded-objects', 'external-links'},
    'signature': {'signatures'},
    'thumbnail': {'thumbnails'},
    'font': {'embedded-fonts'},
}
ALL_PRIVATE_REASONS = set().union(*CATEGORY_REASONS.values())


def sanitize_office(source, output, remove_categories=None):
    """Write an Office package without common private document structures."""
    source = Path(source)
    output = Path(output)
    selected_reasons = _selected_reasons(remove_categories)
    removed = set()
    with zipfile.ZipFile(source, 'r') as input_archive:
        entries = input_archive.infolist()
        _validate_archive(entries)
        with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as output_archive:
            for entry in entries:
                reason = _private_part_reason(entry.filename)
                if reason and reason in selected_reasons:
                    removed.add(reason)
                    continue
                content = input_archive.read(entry.filename)
                if _is_word_xml(entry.filename) and 'revisions' in selected_reasons:
                    content, changed = _remove_word_revisions(content)
                    if changed:
                        removed.add('revisions')
                if entry.filename.lower().endswith('.rels'):
                    content, relationship_reasons = _remove_private_relationships(content, selected_reasons)
                    removed.update(relationship_reasons)
                output_archive.writestr(entry.filename, content)
    return {'removed': sorted(removed)}


def _selected_reasons(remove_categories):
    if remove_categories is None:
        return ALL_PRIVATE_REASONS
    selected = set()
    for category in remove_categories:
        selected.update(CATEGORY_REASONS.get(str(category), set()))
    return selected


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


def _remove_private_relationships(content, selected_reasons):
    try:
        root = ET.fromstring(content)
    except ET.ParseError:
        return content, set()
    removed = set()
    for relationship in list(root):
        reason = _relationship_reason(relationship)
        if reason and reason in selected_reasons:
            root.remove(relationship)
            removed.add(reason)
    return (ET.tostring(root, encoding='utf-8', xml_declaration=True), removed) if removed else (content, removed)


def _relationship_reason(relationship):
    if str(relationship.attrib.get('TargetMode', '')).lower() == 'external':
        return 'external-links'
    description = f"{relationship.attrib.get('Type', '')} {relationship.attrib.get('Target', '')}".lower()
    if any(token in description for token in ('comment', 'person', 'people')):
        return 'comments'
    if any(token in description for token in ('customxml', 'embedding', 'activex', 'vba')):
        return 'embedded-objects'
    if 'font' in description:
        return 'embedded-fonts'
    if 'signature' in description:
        return 'signatures'
    return None


def main():
    parser = argparse.ArgumentParser(description='Remove private structures from an Office Open XML package.')
    parser.add_argument('source')
    parser.add_argument('output')
    parser.add_argument('--remove', dest='remove_categories', nargs='*', default=None)
    args = parser.parse_args()
    print(json.dumps(sanitize_office(args.source, args.output, args.remove_categories)))


if __name__ == '__main__':
    main()
