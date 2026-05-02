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

    private var visibleTodos: [TodoItem] {
        Array(entry.todos.prefix(maxCount))
    }

    var body: some View {
        GeometryReader { geometry in
            let widgetSize = geometry.size

            ForEach(visibleTodos) { item in
                Button(intent: CompleteTodoIntent(todoID: item.id.uuidString)) {
                    postItContent(for: item, size: postItSize)
                }
                .buttonStyle(.plain)
                .position(
                    x: item.positionX * widgetSize.width,
                    y: item.positionY * widgetSize.height
                )
            }

            if !visibleTodos.isEmpty {
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
                .padding(6)
        }
        .frame(width: size, height: size)
        .rotationEffect(.degrees(item.rotation))
    }
}
