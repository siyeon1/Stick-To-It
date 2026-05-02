import WidgetKit
import SwiftUI

struct StickToItWidget: Widget {
    let kind: String = "StickToItWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: StickToItProvider()) { entry in
            StickToItWidgetView(entry: entry)
        }
        .configurationDisplayName("Stick to it")
        .description("Your post-it todos at a glance.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}
