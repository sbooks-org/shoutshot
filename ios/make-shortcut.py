#!/usr/bin/env python3
"""Builds "Shoutshot to Imgur.shortcut" for iPhone/iPad Shortcuts.

What the shortcut does (meant to be run from Back Tap or the Action Button):
  1. Take a screenshot (not saved to Photos)
  2. Base64-encode it and POST it to Imgur the same way imgur.com's own
     uploader does (web client id, guest upload)
  3. Copy [img]<direct link>[/img] to the clipboard and show a notification,
     or show Imgur's error message if the upload failed

Run:  python3 ios/make-shortcut.py   (writes and signs ios/Shoutshot to Imgur.shortcut)
"""
import os
import plistlib
import subprocess
import uuid

IMGUR_CLIENT_ID = 'd70305e7c3ac5c6'  # imgur.com's own web client id (see extension/background.js)
TEMPLATE = '[img]{}[/img]'  # {} = direct image link
NAME = 'Shoutshot to Imgur'
OBJ = '￼'  # Shortcuts' placeholder character for an inline variable

HERE = os.path.dirname(os.path.abspath(__file__))


def new_uuid():
    return str(uuid.uuid4()).upper()


def output_ref(action_uuid, name):
    return {'OutputUUID': action_uuid, 'Type': 'ActionOutput', 'OutputName': name}


def attachment(action_uuid, name):
    """A parameter that is just the output of an earlier action."""
    return {'Value': output_ref(action_uuid, name), 'WFSerializationType': 'WFTextTokenAttachment'}


def text(s, refs=()):
    """A text parameter. Each OBJ in `s` is replaced by the next ref in `refs`."""
    by_range = {}
    pos = 0
    for ref in refs:
        i = s.index(OBJ, pos)
        # Ranges are in UTF-16 units; everything here is in the BMP.
        by_range[f'{{{i}, 1}}'] = ref
        pos = i + 1
    value = {'string': s}
    if by_range:
        value['attachmentsByRange'] = by_range
    return {'Value': value, 'WFSerializationType': 'WFTextTokenString'}


def dict_field(items):
    """A dictionary parameter (e.g. a JSON request body) of text values."""
    return {
        'Value': {
            'WFDictionaryFieldValueItems': [
                {'WFItemType': 0, 'WFKey': text(k), 'WFValue': v} for k, v in items
            ]
        },
        'WFSerializationType': 'WFDictionaryFieldValue',
    }


def action(identifier, **params):
    return {'WFWorkflowActionIdentifier': identifier, 'WFWorkflowActionParameters': params}


shot, b64, resp, link, bbcode, err = (new_uuid() for _ in range(6))
group = new_uuid()

actions = [
    action('is.workflow.actions.takescreenshot', UUID=shot),
    action(
        'is.workflow.actions.base64encode',
        UUID=b64,
        WFInput=attachment(shot, 'Screenshot'),
        WFEncodeMode='Encode',
        WFBase64LineBreakMode='None',
    ),
    action(
        'is.workflow.actions.downloadurl',
        UUID=resp,
        WFURL=f'https://api.imgur.com/3/upload?client_id={IMGUR_CLIENT_ID}',
        WFHTTPMethod='POST',
        WFHTTPBodyType='JSON',
        WFJSONValues=dict_field([
            ('image', text(OBJ, [output_ref(b64, 'Base64 Encoded')])),
            ('type', text('base64')),
        ]),
    ),
    action(
        'is.workflow.actions.getvalueforkey',
        UUID=link,
        WFInput=attachment(resp, 'Contents of URL'),
        WFGetDictionaryValueType='Value',
        WFDictionaryKey='data.link',
    ),
    # If the link has any value → success
    action(
        'is.workflow.actions.conditional',
        GroupingIdentifier=group,
        WFControlFlowMode=0,
        WFCondition=100,
        WFInput={'Type': 'Variable', 'Variable': attachment(link, 'Dictionary Value')},
    ),
    action(
        'is.workflow.actions.gettext',
        UUID=bbcode,
        WFTextActionText=text(TEMPLATE.format(OBJ), [output_ref(link, 'Dictionary Value')]),
    ),
    action('is.workflow.actions.setclipboard', WFInput=attachment(bbcode, 'Text')),
    action(
        'is.workflow.actions.notification',
        WFNotificationActionTitle=text('BBCode copied'),
        WFNotificationActionBody=text(OBJ, [output_ref(bbcode, 'Text')]),
        WFNotificationActionSound=False,
    ),
    action('is.workflow.actions.conditional', GroupingIdentifier=group, WFControlFlowMode=1),
    action(
        'is.workflow.actions.getvalueforkey',
        UUID=err,
        WFInput=attachment(resp, 'Contents of URL'),
        WFGetDictionaryValueType='Value',
        WFDictionaryKey='data.error',
    ),
    action(
        'is.workflow.actions.notification',
        WFNotificationActionTitle=text('Imgur upload failed'),
        WFNotificationActionBody=text(OBJ, [output_ref(err, 'Dictionary Value')]),
    ),
    action('is.workflow.actions.conditional', GroupingIdentifier=group, WFControlFlowMode=2),
]

workflow = {
    'WFWorkflowClientVersion': '2607.0.2',
    'WFWorkflowMinimumClientVersion': 900,
    'WFWorkflowMinimumClientVersionString': '900',
    'WFWorkflowIcon': {'WFWorkflowIconStartColor': 4282601983, 'WFWorkflowIconGlyphNumber': 59511},
    'WFWorkflowImportQuestions': [],
    'WFWorkflowInputContentItemClasses': [],
    'WFWorkflowTypes': [],
    'WFWorkflowHasOutputFallback': False,
    'WFWorkflowHasShortcutInputVariables': False,
    'WFWorkflowActions': actions,
}

unsigned = os.path.join(HERE, f'{NAME} (unsigned).shortcut')
signed = os.path.join(HERE, f'{NAME}.shortcut')
with open(unsigned, 'wb') as f:
    plistlib.dump(workflow, f, fmt=plistlib.FMT_BINARY)
subprocess.run(['shortcuts', 'sign', '--mode', 'anyone', '--input', unsigned, '--output', signed], check=True)
os.remove(unsigned)
print('Wrote', signed)
