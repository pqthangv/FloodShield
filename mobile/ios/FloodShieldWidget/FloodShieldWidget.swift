import SwiftUI
import WidgetKit

/// The home-screen widget, small and medium: weather, place and the warning band. The same rules
/// and look as the Android widget (android/.../widget/). A tap opens the app.
@main
struct FloodShieldWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: WidgetData.kind, provider: Provider()) { entry in
      WidgetView(entry: entry)
    }
    .configurationDisplayName("FloodShield")
    .description(Texts.phone.galleryDescription)
    .supportedFamilies([.systemSmall, .systemMedium])
    .withoutContentMargins()
  }
}

struct Entry: TimelineEntry {
  let date: Date
  let snapshot: Snapshot?
  let language: String

  static func now(_ date: Date) -> Entry {
    Entry(date: date, snapshot: WidgetData.load(), language: WidgetData.language)
  }
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> Entry {
    Entry(date: Date(), snapshot: nil, language: WidgetData.language)
  }

  func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
    completion(.now(Date()))
  }

  // The app redraws the widget whenever it saves new data (FSReloadWidgets). Here: again every 30
  // minutes, and at the moment the last check gets too old, so the band turns neutral by itself.
  func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
    let now = Date()
    WidgetData.markShown(now)
    let entry = Entry.now(now)
    var entries = [entry]
    if let checkedAt = entry.snapshot?.checkedAt, checkedAt > 0 {
      let staleAt = Date(timeIntervalSince1970: checkedAt / 1000 + staleAfter + 1)
      if staleAt > now {
        entries.append(Entry(date: staleAt, snapshot: entry.snapshot, language: entry.language))
      }
    }
    completion(Timeline(entries: entries, policy: .after(now.addingTimeInterval(30 * 60))))
  }
}

struct WidgetView: View {
  @Environment(\.widgetFamily) private var family
  let entry: Entry

  var body: some View {
    let texts = Texts(language: entry.language)
    let small = family == .systemSmall
    VStack(spacing: 0) {
      Group {
        if small {
          SmallTop(snapshot: entry.snapshot, texts: texts)
        } else {
          MediumTop(snapshot: entry.snapshot, texts: texts)
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      BandView(band: bandFor(entry.snapshot, now: entry.date), texts: texts, small: small)
    }
    .widgetBackground(Palette.card)
  }
}

// MARK: - The two sizes

private struct SmallTop: View {
  let snapshot: Snapshot?
  let texts: Texts

  var body: some View {
    // With the wind / feels-like row when it fits, spaced evenly in the height left (as on
    // Android); without it on small screens.
    IfItFits(
      full: VStack(alignment: .leading, spacing: 4) {
        weatherRow
        place
        Spacer(minLength: 4)
        HStack(spacing: 0) {
          Detail(label: texts.wind, value: wind(snapshot))
          Detail(label: texts.feelsLike, value: feelsLike(snapshot))
        }
        Spacer(minLength: 4)
      },
      compact: VStack(alignment: .leading, spacing: 4) {
        weatherRow
        place
        Spacer(minLength: 0)
      })
      .padding(.horizontal, 12)
      .padding(.top, 10)
      .padding(.bottom, 6)
  }

  private var weatherRow: some View {
    HStack(spacing: 4) {
      WeatherImage(snapshot: snapshot).frame(width: 44, height: 44)
      Spacer(minLength: 4)
      Text(temperature(snapshot))
        .font(.system(size: 28, weight: .bold))
        .foregroundColor(Palette.navy)
    }
  }

  private var place: some View {
    Text(snapshot?.place ?? "FloodShield")
      .font(.system(size: 13))
      .foregroundColor(Palette.navy)
      .lineLimit(2)
  }
}

private struct MediumTop: View {
  let snapshot: Snapshot?
  let texts: Texts

  var body: some View {
    IfItFits(
      full: VStack(spacing: 8) {
        mainRow
        HStack(spacing: 0) {
          Detail(label: texts.wind, value: wind(snapshot))
          Detail(label: texts.feelsLike, value: feelsLike(snapshot))
          Detail(label: texts.humidity, value: humidity(snapshot))
        }
      },
      compact: mainRow)
      .padding(.horizontal, 14)
      .padding(.vertical, 8)
  }

  private var mainRow: some View {
    HStack(alignment: .center, spacing: 10) {
      WeatherImage(snapshot: snapshot).frame(width: 60, height: 60)
      VStack(alignment: .leading, spacing: 0) {
        Text(temperature(snapshot))
          .font(.system(size: 32, weight: .bold))
          .foregroundColor(Palette.navy)
        Text(snapshot?.condition ?? "")
          .font(.system(size: 15))
          .foregroundColor(Palette.navy)
          .lineLimit(1)
      }
      Spacer(minLength: 6)
      VStack(alignment: .trailing, spacing: 2) {
        Text(snapshot?.place ?? "FloodShield")
          .font(.system(size: 15, weight: .bold))
          .foregroundColor(Palette.navy)
          .multilineTextAlignment(.trailing)
          .lineLimit(2)
        if let checkedAt = snapshot?.checkedAt, checkedAt > 0 {
          Text(texts.updated(timeOfDay(checkedAt)))
            .font(.system(size: 13))
            .foregroundColor(Palette.grey)
        }
      }
      .frame(maxWidth: 150, alignment: .trailing)
    }
  }
}

// MARK: - Pieces

private struct BandView: View {
  let band: Band
  let texts: Texts
  let small: Bool

  var body: some View {
    HStack(spacing: small ? 6 : 8) {
      switch band {
      case .unknown:
        label(texts.openApp, ink: .white)
      case .clear:
        Image(systemName: "checkmark.circle.fill")
          .symbolRenderingMode(.palette)
          .foregroundStyle(Palette.clear, Color.white)
          .font(.system(size: small ? 16 : 20))
        label(small ? texts.noAlertsShort : texts.noAlerts, ink: .white)
      case let .warning(title, severity, others):
        // White on the orange of "moderate" is hard to read: navy there.
        let ink = severity == "moderate" ? Palette.navy : Color.white
        Image(systemName: "exclamationmark.triangle.fill")
          .foregroundColor(ink)
          .font(.system(size: small ? 15 : 19))
        let more = others > 0 ? " +\(others)" : ""
        label(small ? title + more : "\(title)\(more) · \(texts.severity(severity))", ink: ink)
      }
      Spacer(minLength: 0)
    }
    .padding(.horizontal, small ? 10 : 14)
    .padding(.vertical, small ? 6 : 8)
    .frame(maxWidth: .infinity, minHeight: small ? 40 : 44)
    .background(background)
  }

  private var background: Color {
    switch band {
    case .unknown: return Palette.navy
    case .clear: return Palette.clear
    case let .warning(_, severity, _): return Palette.band(severity)
    }
  }

  private func label(_ text: String, ink: Color) -> some View {
    Text(text)
      .font(.system(size: small ? 13 : 16, weight: .bold))
      .foregroundColor(ink)
      .lineLimit(small ? 2 : 1)
  }
}

/// A small grey label above its value, like the app's Home screen ("WIND / 14 km/h").
private struct Detail: View {
  let label: String
  let value: String

  var body: some View {
    VStack(spacing: 2) {
      Text(label.uppercased())
        .font(.system(size: 12))
        .foregroundColor(Palette.grey)
        .lineLimit(1)
      Text(value)
        .font(.system(size: 16, weight: .bold))
        .foregroundColor(Palette.navy)
        .lineLimit(1)
    }
    .frame(maxWidth: .infinity)
  }
}

private struct WeatherImage: View {
  let snapshot: Snapshot?

  var body: some View {
    Image(weatherImageName(snapshot?.icon, isDay: snapshot?.isDay ?? true))
      .resizable()
      .scaledToFit()
  }
}

/// The first layout when it fits the widget's height, else the second. Before iOS 16 (no
/// ViewThatFits) always the second: nothing gets cut off.
private struct IfItFits<Full: View, Compact: View>: View {
  let full: Full
  let compact: Compact

  var body: some View {
    if #available(iOS 16.0, *) {
      ViewThatFits(in: .vertical) {
        full
        compact
      }
    } else {
      compact
    }
  }
}

// MARK: - Formatting

private func temperature(_ snapshot: Snapshot?) -> String {
  snapshot?.temperature.map { "\(Int($0.rounded()))°" } ?? "--°"
}

private func wind(_ snapshot: Snapshot?) -> String {
  snapshot?.windSpeed.map { "\(Int($0.rounded())) km/h" } ?? "--"
}

private func feelsLike(_ snapshot: Snapshot?) -> String {
  snapshot?.feelsLike.map { "\(Int($0.rounded()))°" } ?? "--"
}

private func humidity(_ snapshot: Snapshot?) -> String {
  snapshot?.humidity.map { "\(Int($0.rounded()))%" } ?? "--"
}

private func timeOfDay(_ milliseconds: Double) -> String {
  let formatter = DateFormatter()
  formatter.locale = Locale(identifier: "en_US_POSIX")
  formatter.dateFormat = "HH:mm"
  return formatter.string(from: Date(timeIntervalSince1970: milliseconds / 1000))
}

// MARK: - iOS 17

extension WidgetConfiguration {
  /// iOS 17 adds margins around the content; the band goes from edge to edge, so the widget keeps
  /// its own padding instead.
  func withoutContentMargins() -> some WidgetConfiguration {
    if #available(iOS 17.0, *) {
      return contentMarginsDisabled()
    } else {
      return self
    }
  }
}

extension View {
  /// iOS 17 wants the widget's background through containerBackground.
  @ViewBuilder func widgetBackground(_ color: Color) -> some View {
    if #available(iOS 17.0, *) {
      containerBackground(for: .widget) { color }
    } else {
      background(color)
    }
  }
}
