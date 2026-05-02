import WidgetKit
import Foundation

struct StickToItProvider: TimelineProvider {
    private let store = TodoStore()

    func placeholder(in context: Context) -> StickToItEntry {
        let sampleTodos: [TodoItem] = [
            TodoItem(
                id: UUID(),
                text: "Buy oat milk",
                colorTheme: .muted,
                colorIndex: 0,
                rotation: -4.5,
                positionX: 0.2,
                positionY: 0.3,
                createdAt: Date(),
                isComplete: false
            ),
            TodoItem(
                id: UUID(),
                text: "Call dentist",
                colorTheme: .muted,
                colorIndex: 1,
                rotation: 3.2,
                positionX: 0.55,
                positionY: 0.25,
                createdAt: Date(),
                isComplete: false
            ),
            TodoItem(
                id: UUID(),
                text: "Read 20 pages",
                colorTheme: .muted,
                colorIndex: 2,
                rotation: -2.1,
                positionX: 0.75,
                positionY: 0.6,
                createdAt: Date(),
                isComplete: false
            ),
            TodoItem(
                id: UUID(),
                text: "Water the plants",
                colorTheme: .muted,
                colorIndex: 3,
                rotation: 5.8,
                positionX: 0.35,
                positionY: 0.7,
                createdAt: Date(),
                isComplete: false
            ),
        ]
        return StickToItEntry(date: Date(), todos: sampleTodos)
    }

    func getSnapshot(in context: Context, completion: @escaping (StickToItEntry) -> Void) {
        let todos = store.load().filter { !$0.isComplete }
        let entry = StickToItEntry(date: Date(), todos: Array(todos.prefix(12)))
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<StickToItEntry>) -> Void) {
        let todos = store.load().filter { !$0.isComplete }
        let entry = StickToItEntry(date: Date(), todos: Array(todos.prefix(12)))
        let refreshDate = Date().addingTimeInterval(60 * 15)
        let timeline = Timeline(entries: [entry], policy: .after(refreshDate))
        completion(timeline)
    }
}
