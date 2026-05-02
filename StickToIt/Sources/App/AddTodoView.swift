import SwiftUI
import WidgetKit

struct AddTodoView: View {
    @Environment(\.dismiss) private var dismiss

    let boardSize: CGSize
    let store: TodoStore

    @State private var draft: String = ""
    @State private var selectedTheme: ColorTheme

    init(boardSize: CGSize, store: TodoStore, defaultTheme: ColorTheme) {
        self.boardSize = boardSize
        self.store = store
        _selectedTheme = State(initialValue: defaultTheme)
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color(hex: "#F5F1E8").ignoresSafeArea()

                VStack(alignment: .leading, spacing: 24) {
                    TextField("What's on your mind?", text: $draft)
                        .font(.system(.body, design: .rounded, weight: .regular))
                        .font(.system(size: 16, weight: .regular, design: .rounded))
                        .padding()
                        .background(Color.white.opacity(0.7))
                        .clipShape(RoundedRectangle(cornerRadius: 10))

                    VStack(alignment: .leading, spacing: 10) {
                        Text("Color Theme")
                            .font(.system(.subheadline, design: .rounded, weight: .medium))
                            .foregroundStyle(Color(hex: "#2C2C2C"))

                        Picker("Theme", selection: $selectedTheme) {
                            ForEach(ColorTheme.allCases, id: \.self) { theme in
                                Text(theme.rawValue.capitalized).tag(theme)
                            }
                        }
                        .pickerStyle(.segmented)

                        HStack(spacing: 8) {
                            ForEach(0..<5, id: \.self) { index in
                                Circle()
                                    .fill(selectedTheme.colors[index])
                                    .frame(width: 24, height: 24)
                            }
                        }
                        .padding(.top, 4)
                    }

                    Spacer()
                }
                .padding(20)
            }
            .navigationTitle("New Todo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .foregroundStyle(Color(hex: "#2C2C2C"))
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
                        guard !trimmed.isEmpty else { return }
                        store.add(text: trimmed, theme: selectedTheme, boardSize: boardSize)
                        WidgetCenter.shared.reloadAllTimelines()
                        dismiss()
                    }
                    .font(.system(.body, design: .rounded, weight: .semibold))
                    .foregroundStyle(Color(hex: "#2C2C2C"))
                    .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}
