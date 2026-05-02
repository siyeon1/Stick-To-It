import AppIntents
import WidgetKit

struct CompleteTodoIntent: AppIntent {
    static var title: LocalizedStringResource = "Complete Todo"

    @Parameter(title: "Todo ID") var todoID: String

    init() {}

    init(todoID: String) {
        self.todoID = todoID
    }

    func perform() async throws -> some IntentResult {
        guard let uuid = UUID(uuidString: todoID) else { return .result() }
        let store = TodoStore()
        store.complete(id: uuid)
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}
