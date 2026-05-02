import SwiftUI
import WidgetKit
import AppIntents

struct StickToItWidgetView: View {
    @Environment(\.widgetFamily) var family

    let entry: StickToItEntry

    private var maxCount: Int {
        switch family {
        case .systemMedium: return 6
        case .systemLarge:  return 12
        default:            return 6
        }
    }

    private var postItSize: CGFloat {
        switch family {
        case .systemMedium: return 56
        case .systemLarge:  return 64
        default:            return 56
        }
    }

    /// Sorted most-recent-first so overflow drops the oldest todos.
    private var sortedTodos: [TodoItem] {
        entry.todos.sorted { $0.createdAt > $1.createdAt }
    }

    private var visibleTodos: [TodoItem] {
        Array(sortedTodos.prefix(maxCount))
    }

    private var extraCount: Int {
        max(0, entry.todos.count - maxCount)
    }

    var body: some View {
        GeometryReader { geometry in
            let widgetSize = geometry.size

            if entry.todos.isEmpty {
                VStack(spacing: 6) {
                    Image(systemName: "checkmark.circle")
                        .font(.system(size: 24, weight: .regular))
                        .foregroundStyle(Color(hex: "#2C2C2C").opacity(0.3))
                    Text("All clear")
                        .font(.system(size: 10, weight: .regular, design: .rounded))
                        .foregroundStyle(Color(hex: "#2C2C2C").opacity(0.3))
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("No todos. All clear.")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ForEach(visibleTodos) { item in
                    Button(intent: CompleteTodoIntent(todoID: item.id.uuidString)) {
                        postItContent(for: item, size: postItSize)
                    }
                    .buttonStyle(.plain)
                    .position(
                        x: item.positionX * widgetSize.width,
                        y: item.positionY * widgetSize.height
                    )
                    .accessibilityLabel("Todo: \(item.text)")
                    .accessibilityHint("Double tap to mark complete")
                    .accessibilityAddTraits(.isButton)
                }

                if extraCount > 0 {
                    Text("+\(extraCount)")
                        .font(.system(size: 9, weight: .medium, design: .rounded))
                        .foregroundStyle(Color(hex: "#2C2C2C"))
                        .padding(.horizontal, 4)
                        .padding(.vertical, 2)
                        .background(
                            Capsule()
                                .fill(Color(hex: "#2C2C2C").opacity(0.08))
                        )
                        .padding(.top, 8)
                        .padding(.trailing, 8)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                }

                Text("tap to clear")
                    .font(.system(size: 9, weight: .regular, design: .rounded))
                    .foregroundStyle(Color(hex: "#2C2C2C").opacity(0.4))
                    .padding(.leading, 8)
                    .padding(.bottom, 8)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
            }
        }
        .containerBackground(Color(hex: "#F5F1E8"), for: .widget)
    }

    @ViewBuilder
    private func postItContent(for item: TodoItem, size: CGFloat) -> some View {
        ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: 4)
                .fill(item.colorTheme.colors[item.colorIndex])
                .shadow(color: .black.opacity(0.12), radius: 4, x: 0, y: 2)

            Text(item.text)
                .font(.system(size: 9, weight: .medium, design: .rounded))
                .foregroundStyle(Color(hex: "#2C2C2C"))
                .multilineTextAlignment(.leading)
                .lineLimit(3)
                .truncationMode(.tail)
                .padding(6)
        }
        .frame(width: size, height: size)
        .rotationEffect(.degrees(item.rotation))
    }
}
