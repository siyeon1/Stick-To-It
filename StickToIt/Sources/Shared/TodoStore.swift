import Foundation
import SwiftUI

final class TodoStore {
    private let defaults: UserDefaults
    private let key = "todos"

    init() {
        guard let defaults = UserDefaults(suiteName: "group.com.siyeonkang.sticktoit") else {
            fatalError("App Group 'group.com.siyeonkang.sticktoit' not configured. " +
                       "Enable App Group capability on both targets in Xcode.")
        }
        self.defaults = defaults
    }

    func load() -> [TodoItem] {
        guard let data = defaults.data(forKey: key) else { return [] }
        do {
            return try JSONDecoder().decode([TodoItem].self, from: data)
        } catch {
            return []
        }
    }

    func save(_ items: [TodoItem]) {
        do {
            let data = try JSONEncoder().encode(items)
            defaults.set(data, forKey: key)
        } catch {
        }
    }

    func add(text: String, theme: ColorTheme, boardSize: CGSize) {
        var items = load()
        let (x, y, rotation) = LayoutEngine.assignPositionAndRotation(existing: items)
        let colorIndex = Int.random(in: 0..<5)
        let newItem = TodoItem(
            id: UUID(),
            text: text,
            colorTheme: theme,
            colorIndex: colorIndex,
            rotation: rotation,
            positionX: x,
            positionY: y,
            createdAt: Date(),
            isComplete: false
        )
        items.append(newItem)
        save(items)
    }

    func complete(id: UUID) {
        var items = load()
        if let index = items.firstIndex(where: { $0.id == id }) {
            items[index].isComplete = true
        }
        save(items)
    }

    func clearCompleted() {
        let items = load().filter { !$0.isComplete }
        save(items)
    }
}
