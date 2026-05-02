import SwiftUI

struct SettingsView: View {
    private let defaults = UserDefaults(suiteName: "group.com.siyeonkang.sticktoit")
    private let themeKey = "defaultTheme"

    @State private var selectedTheme: ColorTheme = .muted

    private var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color(hex: "#F5F1E8").ignoresSafeArea()

                List {
                    Section {
                        VStack(alignment: .leading, spacing: 12) {
                            Picker("Default Theme", selection: $selectedTheme) {
                                ForEach(ColorTheme.allCases, id: \.self) { theme in
                                    Text(theme.rawValue.capitalized).tag(theme)
                                }
                            }
                            .pickerStyle(.segmented)
                            .onChange(of: selectedTheme) { _, newTheme in
                                defaults?.set(newTheme.rawValue, forKey: themeKey)
                            }

                            HStack(spacing: 8) {
                                ForEach(0..<5, id: \.self) { index in
                                    Circle()
                                        .fill(selectedTheme.colors[index])
                                        .frame(width: 28, height: 28)
                                }
                            }
                            .padding(.top, 2)
                        }
                        .padding(.vertical, 8)
                        .listRowBackground(Color(hex: "#F5F1E8").opacity(0.6))
                    } header: {
                        Text("Default Theme")
                            .font(.system(.footnote, design: .rounded, weight: .medium))
                            .textCase(nil)
                    }

                    Section {
                        HStack {
                            Text("Version")
                                .font(.system(.body, design: .rounded))
                                .foregroundStyle(Color(hex: "#2C2C2C"))
                            Spacer()
                            Text(appVersion)
                                .font(.system(.body, design: .rounded))
                                .foregroundStyle(Color(hex: "#2C2C2C").opacity(0.5))
                        }
                        .listRowBackground(Color(hex: "#F5F1E8").opacity(0.6))
                    } header: {
                        Text("About")
                            .font(.system(.footnote, design: .rounded, weight: .medium))
                            .textCase(nil)
                    }
                }
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.large)
            .onAppear {
                loadSavedTheme()
            }
        }
    }

    private func loadSavedTheme() {
        if let raw = defaults?.string(forKey: themeKey),
           let theme = ColorTheme(rawValue: raw) {
            selectedTheme = theme
        }
    }
}
