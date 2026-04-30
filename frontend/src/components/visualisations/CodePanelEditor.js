import React from 'react';
import CodeMirror from '@uiw/react-codemirror';
import {python} from '@codemirror/lang-python';
import {vscodeDark, vscodeLight} from '@uiw/codemirror-theme-vscode';
import {oneDark} from '@codemirror/theme-one-dark';

const EDITOR_THEMES = {
    dark: {cm: vscodeDark},
    light: {cm: vscodeLight},
    oneDark: {cm: oneDark},
};

const CODEMIRROR_EXTENSIONS = [python()];

const CODEMIRROR_BASIC_SETUP = {
    lineNumbers: true,
    highlightActiveLine: true,
    bracketMatching: true,
};

const CodePanelEditor = ({editorCode, onEditorCodeChange, activeTemplate, editorTheme}) => {
    const activeEditorTheme = EDITOR_THEMES[editorTheme] ?? EDITOR_THEMES.dark;

    return (
        <div style={{flex: 1, overflowY: 'auto'}}>
            <CodeMirror
                value={editorCode}
                height="100%"
                theme={activeEditorTheme.cm}
                extensions={CODEMIRROR_EXTENSIONS}
                onChange={onEditorCodeChange}
                editable={!activeTemplate.readOnly}
                basicSetup={CODEMIRROR_BASIC_SETUP}
                style={{fontSize: '14px', fontFamily: 'var(--font-mono)'}}
            />
        </div>
    );
};

export default CodePanelEditor;


