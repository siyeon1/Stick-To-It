import SwiftUI
import WidgetKit

struct BoardView: View {
    @Environment(\.scenePhase) private var scenePhase

    private let store = TodoStore()

    @State private var todos: [TodoItem] = []
    @State private var showingAddSheet = false
    @State private var boardSize: CGSize = .zero

    private var activeTodos: [TodoItem] {
        todos.filter { !$0.isComplete }
    }

    private var defaultTheme: ColorTheme {
        let defaults = UserDefaults(suiteName: "group.com.siyeonkang.sticktoit")
        if let raw = defaults?.string(forKey: "defaultTheme"),
           let theme = ColorTheme(rawValue: raw) {
            return theme
        }
        return .muted
    }

    private var fabColor: Color {
        defaultTheme.colors[0]
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color(hex: "#F5F1E8").ignoresSafeArea()

                GeometryReader { geometry in
                    Color.clear
                        .onAppear {
                            boardSize = geometry.size
                        }
                        .onChange(of: geometry.size) { _, newSize in
                            boardSize = newSize
                        }

                    ForEach(activeTodos) { item in
                        postItView(for: item)
                            .position(
                                x: item.positionX * geometry.size.width,
                                y: item.positionY * geometry.size.height
                            )
                    }
                }

                if activeTodos.isEmpty {
                    VStack(spacing: 8) {
                        Image(systemName: "checkmark.circle")
                            .font(.system(size: 32, weight: .regular))
                            .foregroundStyle(Color(hex: "#2C2C2C").opacity(0.3))
                        Text("All clear")
                            .font(.system(size: 12, weight: .regular, design: .rounded))
                            .foregroundStyle(Color(hex: "#2C2C2C").opacity(0.3))
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("No todos. All clear.")
                }

                VStack {
                    Spacer()
                    HStack {
                        Spacer()
                        Button {
                            showingAddSheet = true
                        } label: {
                            ZStack {
                                Circle()
                                    .fill(fabColor)
                                    .frame(width: 56, height: 56)
                                    .shadow(color: .black.opacity(0.18), radius: 6, x: 0, y: 3)
                                Image(systemName: "plus")
                                    .font(.system(size: 22, weight: .medium))
                                    .foregroundStyle(.white)
                            }
                        }
                        .padding(.trailing, 24)
                        .padding(.bottom, 24)
                    }
                }
            }
            .navigationTitle("Board")
            .navigationBarTitleDisplayMode(.large)
            .onAppear {
                todos = store.load()
            }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active {
                    todos = store.load()
                }
            }
            .sheet(isPresented: $showingAddSheet, onDismiss: {
                todos = store.load()
            }) {
                AddTodoView(
                    boardSize: boardSize,
                    store: store,
                    defaultTheme: defaultTheme
                )
            }
        }
    }

    @ViewBuilder
    private func postItView(for item: TodoItem) -> some View {
        Button {
            store.complete(id: item.id)
            todos = store.load()
            WidgetCenter.shared.reloadAllTimelines()
        } label: {
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: 4)
                    .fill(item.colorTheme.colors[item.colorIndex])
                    .shadow(color: .black.opacity(0.12), radius: 4, x: 0, y: 2)

                Text(item.text)
                    .font(.system(size: 14, weight: .medium, design: .rounded))
                    .foregroundStyle(Color(hex: "#2C2C2C"))
                    .multilineTextAlignment(.leading)
                    .lineLimit(4)
                    .truncationMode(.tail)
                    .padding(8)
            }
            .frame(width: 120, height: 120)
        }
        .buttonStyle(.plain)
        .rotationEffect(.degrees(item.rotation))
        .accessibilityLabel("Todo: \(item.text)")
        .accessibilityHint("Double tap to mark complete")
        .accessibilityAddTraits(.isButton)
    }
}
