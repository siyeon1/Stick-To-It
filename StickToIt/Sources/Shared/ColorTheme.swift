import SwiftUI

enum ColorTheme: String, Codable, CaseIterable {
    case pastel
    case muted
    case bold
    case mono

    var colors: [Color] {
        switch self {
        case .pastel:
            return [
                Color(hex: "#FFE89A"),
                Color(hex: "#FFC4D1"),
                Color(hex: "#BFDCFF"),
                Color(hex: "#CFE9C0"),
                Color(hex: "#DDC9F0"),
            ]
        case .muted:
            return [
                Color(hex: "#D4A5A5"),
                Color(hex: "#B8C9A8"),
                Color(hex: "#A8B5C9"),
                Color(hex: "#E0CC9E"),
                Color(hex: "#C9A48F"),
            ]
        case .bold:
            return [
                Color(hex: "#FF7A6B"),
                Color(hex: "#4DB6AC"),
                Color(hex: "#E5B454"),
                Color(hex: "#3D5A80"),
                Color(hex: "#C7508E"),
            ]
        case .mono:
            return [
                Color(hex: "#4A4A4A"),
                Color(hex: "#6B6B6B"),
                Color(hex: "#8C8C8C"),
                Color(hex: "#ADADAD"),
                Color(hex: "#CFCFCF"),
            ]
        }
    }
}

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let r, g, b: Double
        switch hex.count {
        case 6:
            r = Double((int >> 16) & 0xFF) / 255.0
            g = Double((int >> 8)  & 0xFF) / 255.0
            b = Double( int        & 0xFF) / 255.0
        default:
            r = 0; g = 0; b = 0
        }
        self.init(red: r, green: g, blue: b)
    }
}
