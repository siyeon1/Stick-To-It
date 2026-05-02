import Foundation

enum LayoutEngine {
    /// Assigns a non-overlapping (x, y) position and rotation for a new post-it.
    ///
    /// - Parameter existing: The current array of placed TodoItems.
    /// - Returns: A tuple of normalized x (0.08...0.92), y (0.08...0.92),
    ///   and rotation (-8.0...8.0 degrees).
    ///
    /// Algorithm: rejection sampling up to 30 attempts.
    /// A candidate is accepted if its normalized Euclidean distance to every
    /// existing item is >= 0.18. If all 30 attempts are rejected, the candidate
    /// with the largest minimum-distance to its nearest neighbour is returned
    /// (best-of-rejected fallback).
    static func assignPositionAndRotation(existing: [TodoItem]) -> (x: Double, y: Double, rotation: Double) {
        let minCoord = 0.08
        let maxCoord = 0.92
        let minDistance = 0.18
        let maxAttempts = 30

        var bestCandidate: (x: Double, y: Double) = (
            Double.random(in: minCoord...maxCoord),
            Double.random(in: minCoord...maxCoord)
        )
        var bestMinDist: Double = minimumDistance(to: existing, x: bestCandidate.x, y: bestCandidate.y)

        for attempt in 0..<maxAttempts {
            let cx = Double.random(in: minCoord...maxCoord)
            let cy = Double.random(in: minCoord...maxCoord)
            let dist = minimumDistance(to: existing, x: cx, y: cy)

            if dist >= minDistance {
                let rotation = Double.random(in: -8.0...8.0)
                return (x: cx, y: cy, rotation: rotation)
            }

            if attempt == 0 || dist > bestMinDist {
                bestMinDist = dist
                bestCandidate = (cx, cy)
            }
        }

        // All 30 attempts were rejected — return best-of-rejected candidate.
        // This can happen when the board is very full. The layout will overlap
        // slightly; the caller may want to warn the user.
        let rotation = Double.random(in: -8.0...8.0)
        return (x: bestCandidate.x, y: bestCandidate.y, rotation: rotation)
    }

    // MARK: - Private helpers

    private static func minimumDistance(to items: [TodoItem], x: Double, y: Double) -> Double {
        guard !items.isEmpty else { return Double.infinity }
        return items.map { item in
            let dx = item.positionX - x
            let dy = item.positionY - y
            return (dx * dx + dy * dy).squareRoot()
        }.min() ?? Double.infinity
    }
}
