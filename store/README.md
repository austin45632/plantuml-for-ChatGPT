# Chrome Web Store listing

## Name

PlantUML for ChatGPT

## Short description

Render PlantUML diagrams directly inside ChatGPT conversations.

## Full description

PlantUML for ChatGPT renders PlantUML code blocks in completed ChatGPT
messages as diagrams directly in your browser.

Supported code block labels include `plantuml`, `puml`, and `wsd`. Unlabelled
blocks with complete `@startXXX` / `@endXXX` delimiters are also recognized.

Features:

- Client-side rendering with no server or account access.
- Light and dark theme support.
- Toggle between the diagram and original source.
- Copy diagrams as SVG or PNG.
- Edit a temporary draft with live preview.
- Context menu actions on rendered diagrams.

The extension only requests clipboard write access for copy actions. It does
not store, upload, or share conversation content.

## Privacy statement

PlantUML for ChatGPT processes diagram source locally in the browser. It does
not collect analytics, use remote APIs, save conversation content, or share
data with third parties. Clipboard access is used only when the user clicks a
copy action.

## Permission justification

`clipboardWrite` is required to copy SVG and PNG renderings after an explicit
user action. No other optional permissions are requested.
