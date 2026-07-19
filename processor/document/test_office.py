import tempfile
import unittest
import zipfile
from pathlib import Path
import subprocess

from office import sanitize_office


DOCUMENT = '''<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>Visible text</w:t></w:r><w:ins><w:r><w:t>Accepted edit</w:t></w:r></w:ins><w:del><w:r><w:delText>Deleted edit</w:delText></w:r></w:del></w:p></w:body>
</w:document>'''


class OfficeSanitizerTests(unittest.TestCase):
    def test_removes_private_parts_and_preserves_visible_document_content(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'input.docx'
            output = Path(directory) / 'output.docx'
            with zipfile.ZipFile(source, 'w') as archive:
                archive.writestr('[Content_Types].xml', '<Types/>')
                archive.writestr('docProps/core.xml', '<coreProperties><creator>Ada</creator></coreProperties>')
                archive.writestr('docProps/app.xml', '<Properties><Company>Secret Co</Company></Properties>')
                archive.writestr('docProps/thumbnail.jpeg', b'preview')
                archive.writestr('_xmlsignatures/sig1.xml', '<Signature/>')
                archive.writestr('word/comments.xml', '<comments><comment>Private note</comment></comments>')
                archive.writestr('word/fonts/font1.odttf', b'font')
                archive.writestr('word/embeddings/object1.bin', b'object')
                archive.writestr('word/media/image1.png', b'visible image')
                archive.writestr('word/document.xml', DOCUMENT)
                archive.writestr('word/_rels/document.xml.rels', '''<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                  <Relationship Id="rKeep" Type="image" Target="media/image1.png"/>
                  <Relationship Id="rComment" Type="comments" Target="comments.xml"/>
                </Relationships>''')

            result = sanitize_office(source, output)

            self.assertEqual(result['removed'], ['comments', 'document-properties', 'embedded-fonts', 'embedded-objects', 'revisions', 'signatures', 'thumbnails'])
            with zipfile.ZipFile(output) as archive:
                names = set(archive.namelist())
                self.assertIn('word/document.xml', names)
                self.assertIn('word/media/image1.png', names)
                self.assertNotIn('docProps/core.xml', names)
                self.assertNotIn('word/comments.xml', names)
                self.assertNotIn('word/fonts/font1.odttf', names)
                self.assertNotIn('word/embeddings/object1.bin', names)
                self.assertNotIn('_xmlsignatures/sig1.xml', names)
                document = archive.read('word/document.xml').decode('utf-8')
                self.assertIn('Visible text', document)
                self.assertIn('Accepted edit', document)
                self.assertNotIn('Deleted edit', document)
                self.assertNotIn('<ns0:ins', document)
                relationships = archive.read('word/_rels/document.xml.rels').decode('utf-8')
                self.assertIn('media/image1.png', relationships)
                self.assertNotIn('comments.xml', relationships)

    def test_cli_writes_a_cleaned_office_package(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'input.docx'
            output = Path(directory) / 'output.docx'
            with zipfile.ZipFile(source, 'w') as archive:
                archive.writestr('[Content_Types].xml', '<Types/>')
                archive.writestr('docProps/core.xml', '<coreProperties/>')
                archive.writestr('word/document.xml', DOCUMENT)

            subprocess.run(['python3', str(Path(__file__).with_name('office.py')), str(source), str(output)], check=True)

            self.assertTrue(output.exists())
            with zipfile.ZipFile(output) as archive:
                self.assertNotIn('docProps/core.xml', archive.namelist())


if __name__ == '__main__':
    unittest.main()
