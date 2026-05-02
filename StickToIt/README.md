# Stick to It — Xcode Setup Guide

These are the manual steps you need to perform in Xcode after importing the generated source files.

---

## 1. Create the Xcode Project

1. Open Xcode → **File → New → Project**
2. Choose **iOS → App**
3. Set:
   - Product Name: `StickToIt`
   - Bundle Identifier: `com.siyeonkang.sticktoit`
   - Interface: **SwiftUI**
   - Language: **Swift**
   - Uncheck **Include Tests** (optional for v1)
4. Save the project somewhere convenient (not inside this repo folder).

---

## 2. Add the Widget Extension Target

1. **File → New → Target**
2. Choose **Widget Extension**
3. Set:
   - Product Name: `StickToItWidget`
   - Include Configuration App Intent: **checked** (needed for interactive widget on iOS 17+)
4. Activate the scheme when prompted.

---

## 3. Set iOS Deployment Target

For **both** targets (StickToIt and StickToItWidget):

1. Select the target in the project navigator
2. **General → Deployment Info → iOS 17.0**

---

## 4. Enable App Groups Capability

For **both** targets:

1. Select the target → **Signing & Capabilities → + Capability → App Groups**
2. Add group: `group.com.siyeonkang.sticktoit`
3. Make sure the checkbox is ticked for this group on both targets.

> Without this step, `UserDefaults(suiteName:)` will return `nil` at runtime
> and `TodoStore` will crash with a clear fatalError message.

---

## 5. Add Shared Source Files to Both Targets

The files in `Sources/Shared/` must be compiled into both the app target and the widget extension target.

1. Drag the following files from `Sources/Shared/` into the Xcode project navigator:
   - `TodoItem.swift`
   - `ColorTheme.swift`
   - `TodoStore.swift`
   - `LayoutEngine.swift`
   - `CompleteTodoIntent.swift`
2. In the **Add to targets** dialog, check **both** `StickToIt` and `StickToItWidget`.

> **Important — `CompleteTodoIntent.swift`:** This file must be compiled into
> both targets. The widget extension uses it to render `Button(intent:)` taps,
> and the main app target needs it so the system can resolve the intent. If it
> is only in the widget target, the intent will silently fail to execute on
> device. Verify membership as described below.

To verify after adding: select any shared file → open the **File Inspector** (right panel) → confirm both targets are checked under **Target Membership**.

---

## 6. Add App-Only Source Files

Drag the files in `Sources/App/` into the project and add them to the **StickToIt** target only.

---

## 7. Add Widget-Only Source Files

Drag the files in `Sources/Widget/` into the project and add them to the **StickToItWidget** target only.

---

## 8. Build and Verify

- Select the **StickToIt** scheme → **Product → Build (⌘B)**
- All four shared files should compile without errors.
- There are no SwiftUI previews to run yet (UI comes in later stages).

---

## Folder Reference

```
StickToIt/
  Sources/
    App/        → main app target only
    Widget/     → widget extension target only
    Shared/     → added to BOTH targets in Build Phases
  Resources/    → assets, colors, etc. (later stages)
  README.md     → this file
```

---

## Notes

- **No third-party dependencies** — this project uses only Apple frameworks.
- **No Core Data / SwiftData / CloudKit** — persistence is shared UserDefaults via the App Group.
- All position, rotation, and color data is assigned at creation time and stored. Widget renders are deterministic — nothing is generated at render time.
