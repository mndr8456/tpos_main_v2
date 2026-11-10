"""TPOS read-only LOCAL OASIS UBL 2.1 XSD validation. Requires Python 3 + lxml.

No MyInvois network calls. XSD dependencies must be installed locally from
OASIS UBL 2.1 distribution, preserving xsd/maindoc and xsd/common structure.
"""
import json
import os
import pathlib
import sys

OASIS = 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2'

def report(status, executed=False, valid=False, issues=None):
    print(json.dumps({'status':status,'xsdExecuted':executed,'xsdValid':valid,'issues':issues or []},ensure_ascii=True))

def main():
    if len(sys.argv)!=2:
        return report('XSD_PATH_MISSING')
    file=pathlib.Path(sys.argv[1]).resolve()
    if file.name != 'UBL-Invoice-2.1.xsd' or file.parent.name!='maindoc' or file.parent.parent.name!='xsd':
        return report('XSD_PATH_INVALID')
    if not file.is_file() or not (file.parent.parent/'common').is_dir():
        return report('XSD_NOT_INSTALLED')
    try:
        from lxml import etree
    except ImportError:
        return report('XSD_ENGINE_NOT_INSTALLED')
    try:
        # Disallow HTTP(S) and external entity expansion in the schema or instance.
        parser=etree.XMLParser(resolve_entities=False,load_dtd=False,no_network=True,huge_tree=False)
        schema_doc=etree.parse(str(file), parser)
        if schema_doc.getroot().get('targetNamespace')!=OASIS:
            return report('XSD_NAMESPACE_INVALID')
        root=file.parent.parent.resolve()
        for item in root.rglob('*.xsd'):
            if item.is_symlink():return report('XSD_UNTRUSTED_SYMLINK')
            # OASIS schema references should never require remote resolution.
            tree=etree.parse(str(item),parser)
            for inc in tree.xpath('//*[local-name()="import" or local-name()="include" or local-name()="redefine"]'):
                loc=inc.get('schemaLocation','')
                if not loc or ':' in loc or loc.startswith('/') or '\\' in loc:
                    return report('XSD_EXTERNAL_REFERENCE_BLOCKED')
                target=(item.parent/loc).resolve()
                if not target.is_relative_to(root) or not target.is_file():
                    return report('XSD_DEPENDENCY_MISSING')
        schema=etree.XMLSchema(schema_doc)
    except (OSError,ValueError,etree.XMLSyntaxError,etree.XMLSchemaParseError) as exc:
        return report('XSD_SCHEMA_LOAD_FAILED',issues=[{'code':'XSD_SCHEMA_LOAD_FAILED','detail':'Check local OASIS XSD dependencies'}])
    try:
        data=sys.stdin.buffer.read(3_000_001)
        if len(data)>3_000_000:return report('XML_SIZE_LIMIT')
        instance=etree.fromstring(data,etree.XMLParser(resolve_entities=False,load_dtd=False,no_network=True,huge_tree=False))
        valid=schema.validate(instance)
        issues=[] if valid else [{'code':'XSD_VALIDATION_ERROR','line':e.line,'type':e.type_name} for e in list(schema.error_log)[:20]]
        return report('LOCAL_XSD_VALID' if valid else 'LOCAL_XSD_INVALID',True,valid,issues)
    except (ValueError,etree.XMLSyntaxError) as exc:
        return report('XML_PARSE_FAILED',True,False,[{'code':'XML_PARSE_FAILED','detail':'Check local OASIS XSD dependencies'}])

if __name__=='__main__':main()
