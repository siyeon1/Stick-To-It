import Foundation

struct TodoItem: Codable, Identifiable {
    let id: UUID
    var text: String
    var colorTheme: ColorTheme
    var colorIndex: Int
    var rotation: Double
    var positionX: Double
    var positionY: Double
    var createdAt: Date
    var isComplete: Bool
}
