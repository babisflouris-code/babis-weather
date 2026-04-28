import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, PointerEvent } from 'react'
import './App.css'

type GeoResult = {
  id: number
  name: string
  latitude: number
  longitude: number
  country: string
  admin1?: string
}

type WeatherResponse = {
  current: {
    temperature_2m: number
    apparent_temperature: number
    weather_code: number
    wind_speed_10m: number
    wind_gusts_10m: number
    wind_direction_10m: number
    relative_humidity_2m: number
    surface_pressure: number
    cloud_cover: number
    precipitation: number
    uv_index: number
    time: string
  }
  daily: {
    time: string[]
    weather_code: number[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    precipitation_probability_max: number[]
  }
  hourly: {
    time: string[]
    temperature_2m: number[]
    precipitation_probability: number[]
    weather_code: number[]
  }
}

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const RECENT_SEARCHES_KEY = 'kairos_recent_searches'
const THEME_KEY = 'kairos_theme'
const SAVED_LOCATIONS_KEY = 'kairos_saved_locations'
const weatherCodeToText: Record<number, string> = {
  0: 'Καθαρός ουρανός',
  1: 'Κυρίως αίθριος',
  2: 'Λίγες νεφώσεις',
  3: 'Συννεφιά',
  45: 'Ομίχλη',
  48: 'Παγωμένη ομίχλη',
  51: 'Ελαφρύ ψιλόβροχο',
  53: 'Ψιλόβροχο',
  55: 'Έντονο ψιλόβροχο',
  56: 'Παγωμένο ψιλόβροχο',
  57: 'Έντονο παγωμένο ψιλόβροχο',
  61: 'Ελαφριά βροχή',
  63: 'Βροχή',
  65: 'Ισχυρή βροχή',
  66: 'Παγωμένη βροχή',
  67: 'Έντονη παγωμένη βροχή',
  71: 'Ελαφρύ χιόνι',
  73: 'Χιονόπτωση',
  75: 'Έντονη χιονόπτωση',
  77: 'Νιφάδες χιονιού',
  80: 'Μπόρες',
  81: 'Μπόρες βροχής',
  82: 'Ισχυρές μπόρες',
  85: 'Μπόρες χιονιού',
  86: 'Ισχυρές μπόρες χιονιού',
  95: 'Καταιγίδα',
  96: 'Καταιγίδα με χαλάζι',
  99: 'Ισχυρή καταιγίδα με χαλάζι',
}

type WeatherIconKind = 'sun' | 'partly' | 'fog' | 'rain' | 'snow' | 'storm'

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('el-GR', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('el-GR', {
    hour: '2-digit',
    minute: '2-digit',
  })

const fmtLocation = (location: GeoResult) =>
  [location.name, location.admin1, location.country].filter(Boolean).join(', ')

const windDirectionToText = (degrees: number) => {
  const directions = ['Β', 'ΒΑ', 'Α', 'ΝΑ', 'Ν', 'ΝΔ', 'Δ', 'ΒΔ']
  const index = Math.round((((degrees % 360) + 360) % 360) / 45) % 8
  return directions[index]
}

const weatherCodeToIcon = (code: number): WeatherIconKind => {
  if (code === 0) return 'sun'
  if (code <= 3) return 'partly'
  if (code === 45 || code === 48) return 'fog'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain'
  if (code >= 71 && code <= 77) return 'snow'
  if (code >= 95) return 'storm'
  return 'partly'
}

const rainChanceLevel = (rainChance: number) => {
  if (rainChance >= 70) return 'pill-high'
  if (rainChance >= 40) return 'pill-medium'
  return 'pill-low'
}

const normalizeQueryInput = (value: string) =>
  value
    // Strip hidden bidi control chars that can flip visual typing direction.
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .normalize('NFC')

const forceInputCaretToEnd = (input: HTMLInputElement) => {
  const end = input.value.length
  requestAnimationFrame(() => {
    input.setSelectionRange(end, end)
  })
}

const WeatherIcon = ({ kind, className }: { kind: WeatherIconKind; className?: string }) => {
  if (kind === 'sun') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <circle cx="12" cy="12" r="4.5" />
        <path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.5 1.5M6.8 17.2l-1.5 1.5M18.7 18.7l-1.5-1.5M6.8 6.8L5.3 5.3" />
      </svg>
    )
  }

  if (kind === 'partly') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path d="M8.4 8.8A3.6 3.6 0 1 1 15 6.1" />
        <path d="M7.5 18.5h8.7a3.3 3.3 0 0 0 .4-6.5 5 5 0 0 0-9.6-1.4A3.9 3.9 0 0 0 7.5 18.5Z" />
      </svg>
    )
  }

  if (kind === 'fog') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path d="M6.5 11.5h11a3.2 3.2 0 0 0 0-6.4 4.8 4.8 0 0 0-9.2 1.4 3.4 3.4 0 0 0-1.8 5Z" />
        <path d="M4 15.5h16M6 18.5h12" />
      </svg>
    )
  }

  if (kind === 'rain') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path d="M7 14.5h9.5a3.2 3.2 0 0 0 .2-6.4 4.8 4.8 0 0 0-9.2 1.4A3.4 3.4 0 0 0 7 14.5Z" />
        <path d="M8.2 17.2l-.5 2.1M12.2 17.2l-.5 2.1M16.2 17.2l-.5 2.1" />
      </svg>
    )
  }

  if (kind === 'snow') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path d="M7 14.5h9.5a3.2 3.2 0 0 0 .2-6.4 4.8 4.8 0 0 0-9.2 1.4A3.4 3.4 0 0 0 7 14.5Z" />
        <path d="M9 18.5h.01M12 17.8h.01M15 18.5h.01" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M7 14.5h9.5a3.2 3.2 0 0 0 .2-6.4 4.8 4.8 0 0 0-9.2 1.4A3.4 3.4 0 0 0 7 14.5Z" />
      <path d="M12.5 14.5l-1.8 3h2l-1.2 4 3-4h-2l1.5-3Z" />
    </svg>
  )
}

function App() {
  const queryInputRef = useRef<HTMLInputElement | null>(null)
  const [query, setQuery] = useState('Athens')
  const [selectedLocation, setSelectedLocation] = useState<GeoResult | null>(null)
  const [weather, setWeather] = useState<WeatherResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [geoLoading, setGeoLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [savedLocations, setSavedLocations] = useState<string[]>([])
  const [selectedSavedLocations, setSelectedSavedLocations] = useState<string[]>([])
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [isChartDragging, setIsChartDragging] = useState(false)
  const [darkMode, setDarkMode] = useState(false)
  const [hourlyStep, setHourlyStep] = useState<1 | 3>(1)

  const dailyRows = useMemo(() => {
    if (!weather) {
      return []
    }

    return weather.daily.time.map((day, index) => ({
      day,
      code: weather.daily.weather_code[index],
      max: weather.daily.temperature_2m_max[index],
      min: weather.daily.temperature_2m_min[index],
      rainChance: weather.daily.precipitation_probability_max[index],
    }))
  }, [weather])

  const selectedDayRow = useMemo(
    () => dailyRows.find((row) => row.day === selectedDay) ?? null,
    [dailyRows, selectedDay],
  )
  const selectedDayHourlyRows = useMemo(() => {
    if (!weather || !selectedDay) {
      return []
    }

    return weather.hourly.time
      .map((time, index) => ({
        time,
        hourLabel: fmtTime(time),
        temp: weather.hourly.temperature_2m[index],
        rainChance: weather.hourly.precipitation_probability[index],
        code: weather.hourly.weather_code[index],
      }))
      .filter((row) => row.time.startsWith(selectedDay))
  }, [weather, selectedDay])
  const visibleHourlyRows = useMemo(
    () => selectedDayHourlyRows.filter((_, index) => index % hourlyStep === 0),
    [selectedDayHourlyRows, hourlyStep],
  )
  const selectedDayIndex = useMemo(
    () => dailyRows.findIndex((row) => row.day === selectedDay),
    [dailyRows, selectedDay],
  )
  const weeklyTempBounds = useMemo(() => {
    if (dailyRows.length === 0) {
      return null
    }
    const mins = dailyRows.map((row) => row.min)
    const maxs = dailyRows.map((row) => row.max)
    return {
      min: Math.min(...mins),
      max: Math.max(...maxs),
    }
  }, [dailyRows])

  useEffect(() => {
    const cached = localStorage.getItem(RECENT_SEARCHES_KEY)
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as string[]
        setRecentSearches(parsed)
      } catch {
        localStorage.removeItem(RECENT_SEARCHES_KEY)
      }
    }
  }, [])

  useEffect(() => {
    const cached = localStorage.getItem(SAVED_LOCATIONS_KEY)
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as string[]
        setSavedLocations(parsed)
      } catch {
        localStorage.removeItem(SAVED_LOCATIONS_KEY)
      }
    }
  }, [])

  useEffect(() => {
    const cachedTheme = localStorage.getItem(THEME_KEY)
    if (cachedTheme === 'dark') {
      setDarkMode(true)
    }
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('theme-dark', darkMode)
    localStorage.setItem(THEME_KEY, darkMode ? 'dark' : 'light')
  }, [darkMode])

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    return () =>
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  }, [])

  useEffect(() => {
    void searchAndLoadWeather('Athens')
  }, [])

  const updateRecentSearches = (city: string) => {
    setRecentSearches((prev) => {
      const next = [city, ...prev.filter((item) => item.toLowerCase() !== city.toLowerCase())]
        .slice(0, 5)
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next))
      return next
    })
  }

  const clearRecentSearches = () => {
    setRecentSearches([])
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify([]))
  }

  const saveLocation = (locationLabel: string) => {
    setSavedLocations((prev) => {
      const next = [locationLabel, ...prev.filter((item) => item !== locationLabel)].slice(0, 12)
      localStorage.setItem(SAVED_LOCATIONS_KEY, JSON.stringify(next))
      return next
    })
    setSelectedSavedLocations((prev) => prev.filter((item) => item !== locationLabel))
  }

  const removeSavedLocation = (locationLabel: string) => {
    setSavedLocations((prev) => {
      const next = prev.filter((item) => item !== locationLabel)
      localStorage.setItem(SAVED_LOCATIONS_KEY, JSON.stringify(next))
      return next
    })
    setSelectedSavedLocations((prev) => prev.filter((item) => item !== locationLabel))
  }

  const toggleSavedLocationSelection = (locationLabel: string) => {
    setSelectedSavedLocations((prev) =>
      prev.includes(locationLabel)
        ? prev.filter((item) => item !== locationLabel)
        : [...prev, locationLabel],
    )
  }

  const removeSelectedSavedLocations = () => {
    if (selectedSavedLocations.length === 0) {
      return
    }
    setSavedLocations((prev) => {
      const next = prev.filter((item) => !selectedSavedLocations.includes(item))
      localStorage.setItem(SAVED_LOCATIONS_KEY, JSON.stringify(next))
      return next
    })
    setSelectedSavedLocations([])
  }

  const clearAllSavedLocations = () => {
    setSavedLocations([])
    setSelectedSavedLocations([])
    localStorage.setItem(SAVED_LOCATIONS_KEY, JSON.stringify([]))
  }

  const fetchWeather = async (location: GeoResult) => {
    const params = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      current: [
        'temperature_2m',
        'apparent_temperature',
        'weather_code',
        'wind_speed_10m',
        'wind_gusts_10m',
        'wind_direction_10m',
        'relative_humidity_2m',
        'surface_pressure',
        'cloud_cover',
        'precipitation',
        'uv_index',
      ].join(','),
      daily: [
        'weather_code',
        'temperature_2m_max',
        'temperature_2m_min',
        'precipitation_probability_max',
      ].join(','),
      hourly: ['temperature_2m', 'precipitation_probability', 'weather_code'].join(','),
      timezone: 'auto',
      forecast_days: '7',
    })

    const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
    if (!weatherRes.ok) {
      throw new Error('Weather request failed')
    }

    const weatherJson = (await weatherRes.json()) as WeatherResponse
    setSelectedLocation(location)
    setWeather(weatherJson)
    setSelectedDay(weatherJson.daily.time[0] ?? null)
  }

  const searchAndLoadWeather = async (cityName: string) => {
    const trimmed = cityName.trim()
    if (!trimmed) {
      setError('Πληκτρολόγησε πρώτα πόλη.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const geoParams = new URLSearchParams({
        name: trimmed,
        count: '1',
        language: 'el',
        format: 'json',
      })

      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?${geoParams}`,
      )
      if (!geoRes.ok) {
        throw new Error('Location search failed')
      }

      const geoJson = (await geoRes.json()) as { results?: GeoResult[] }
      const first = geoJson.results?.[0]
      if (!first) {
        setWeather(null)
        setSelectedLocation(null)
        setError('Δεν βρέθηκε τοποθεσία. Δοκίμασε άλλη πόλη.')
        return
      }

      await fetchWeather(first)
      updateRecentSearches(first.name)
    } catch {
      setError('Δεν ήταν δυνατή η φόρτωση καιρού. Προσπάθησε ξανά.')
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await searchAndLoadWeather(query)
  }

  const onUseMyLocation = async () => {
    if (!navigator.geolocation) {
      setError('Ο browser δεν υποστηρίζει γεωεντοπισμό.')
      return
    }

    setGeoLoading(true)
    setError(null)

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const reverseParams = new URLSearchParams({
            latitude: String(coords.latitude),
            longitude: String(coords.longitude),
            count: '1',
            language: 'el',
            format: 'json',
          })

          const reverseRes = await fetch(
            `https://geocoding-api.open-meteo.com/v1/reverse?${reverseParams}`,
          )
          if (!reverseRes.ok) {
            throw new Error('Reverse geocoding failed')
          }

          const reverseJson = (await reverseRes.json()) as { results?: GeoResult[] }
          const first = reverseJson.results?.[0]
          if (!first) {
            throw new Error('No reverse result')
          }

          setQuery(first.name)
          await fetchWeather(first)
          updateRecentSearches(first.name)
        } catch {
          setError('Δεν βρέθηκε κοντινή πόλη για την τοποθεσία σου.')
        } finally {
          setGeoLoading(false)
        }
      },
      () => {
        setGeoLoading(false)
        setError('Δεν επιτράπηκε η τοποθεσία. Έλεγξε τα δικαιώματα.')
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 },
    )
  }

  const onInstallApp = async () => {
    if (!installPrompt) {
      return
    }
    await installPrompt.prompt()
    await installPrompt.userChoice
    setInstallPrompt(null)
  }

  const updateSelectedDayFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (dailyRows.length === 0) {
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    const rawRatio = (event.clientX - rect.left) / rect.width
    const clampedRatio = Math.min(1, Math.max(0, rawRatio))
    const index = Math.round(clampedRatio * (dailyRows.length - 1))
    const row = dailyRows[index]
    if (row) {
      setSelectedDay(row.day)
    }
  }

  return (
    <main className="app">
      <header>
        <h1>Kairos Weather</h1>
        <p>Γρήγορη πρόγνωση με Open-Meteo χωρίς server</p>
      </header>

      <form className="search" onSubmit={onSubmit}>
        <input
          ref={queryInputRef}
          value={query}
          onChange={(event) => {
            const normalized = normalizeQueryInput(event.target.value)
            setQuery(normalized)
            forceInputCaretToEnd(event.target)
          }}
          onFocus={(event) => forceInputCaretToEnd(event.target)}
          placeholder="Αναζήτηση πόλης (π.χ. Αθήνα)"
          aria-label="Όνομα πόλης"
          title="Πληκτρολόγησε πόλη για πρόγνωση"
          dir="ltr"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <button type="submit" disabled={loading} title="Αναζήτηση καιρού για την πόλη">
          {loading ? 'Φόρτωση...' : 'Αναζήτηση'}
        </button>
      </form>

      <div className="actions">
        <button
          type="button"
          className="secondary"
          onClick={onUseMyLocation}
          disabled={geoLoading}
          title="Χρησιμοποίησε GPS τοποθεσία"
        >
          {geoLoading ? 'Εντοπισμός...' : 'Χρησιμοποίησε την τοποθεσία μου'}
        </button>
        {installPrompt && (
          <button
            type="button"
            className="secondary"
            onClick={onInstallApp}
            title="Εγκατάσταση του Kairos ως εφαρμογή"
          >
            Εγκατάσταση εφαρμογής
          </button>
        )}
        <button
          type="button"
          className="secondary"
          onClick={() => setDarkMode((prev) => !prev)}
          title="Εναλλαγή φωτεινού/σκούρου θέματος"
        >
          {darkMode ? '☀️ Light' : '🌙 Dark'}
        </button>
        {selectedLocation && (
          <button
            type="button"
            className="secondary"
            title="Αποθήκευση τρέχουσας τοποθεσίας"
            onClick={() => saveLocation(selectedLocation.name)}
          >
            ⭐ Αποθήκευση τοποθεσίας
          </button>
        )}
      </div>

      <section className="saved">
        <div className="saved-head">
          <p>Αποθηκευμένες τοποθεσίες:</p>
          <div className="saved-actions">
            <button
              type="button"
              className="secondary"
              onClick={removeSelectedSavedLocations}
              disabled={selectedSavedLocations.length === 0}
              title="Διαγραφή επιλεγμένων τοποθεσιών"
            >
              Διαγραφή επιλεγμένων ({selectedSavedLocations.length})
            </button>
            <button
              type="button"
              className="secondary"
              onClick={clearAllSavedLocations}
              disabled={savedLocations.length === 0}
              title="Διαγραφή όλων των αποθηκευμένων τοποθεσιών"
            >
              Διαγραφή όλων
            </button>
          </div>
        </div>
        {savedLocations.length === 0 ? (
          <p className="saved-empty">Δεν έχεις αποθηκευμένες τοποθεσίες ακόμη.</p>
        ) : (
          <div>
            {savedLocations.map((city) => (
              <span key={city} className="saved-item">
                <button
                  type="button"
                  className={`select-saved ${selectedSavedLocations.includes(city) ? 'active' : ''}`}
                  title={`Επιλογή ${city}`}
                  onClick={() => toggleSavedLocationSelection(city)}
                >
                  {selectedSavedLocations.includes(city) ? '✓' : '○'}
                </button>
                <button
                  type="button"
                  className="chip"
                  title={`Αναζήτηση για ${city}`}
                  onClick={() => {
                    setQuery(city)
                    void searchAndLoadWeather(city)
                  }}
                >
                  {city}
                </button>
                <button
                  type="button"
                  className="remove-saved"
                  title={`Διαγραφή ${city}`}
                  onClick={() => removeSavedLocation(city)}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      {recentSearches.length > 0 && (
        <section className="recent">
          <div className="recent-head">
            <p>Πρόσφατες αναζητήσεις:</p>
            <button
              type="button"
              className="secondary"
              onClick={clearRecentSearches}
              title="Εκκαθάριση πρόσφατων αναζητήσεων"
            >
              Εκκαθάριση πρόσφατων
            </button>
          </div>
          <div>
            {recentSearches.map((city) => (
              <button
                key={city}
                type="button"
                className="chip"
                title={`Αναζήτηση για ${city}`}
                onClick={() => {
                  setQuery(city)
                  void searchAndLoadWeather(city)
                }}
              >
                {city}
              </button>
            ))}
          </div>
        </section>
      )}

      {error && <p className="error">{error}</p>}

      {weather && selectedLocation && (
        <>
          <section className="card current">
            <h2>{fmtLocation(selectedLocation)}</h2>
            <p className="condition" title="Τρέχουσα περιγραφή καιρού">
              <span className="condition-icon-wrap">
                <WeatherIcon
                  className={`weather-icon condition-icon icon-${weatherCodeToIcon(weather.current.weather_code)}`}
                  kind={weatherCodeToIcon(weather.current.weather_code)}
                />
              </span>
              {weatherCodeToText[weather.current.weather_code] ?? 'Άγνωστες συνθήκες'}
            </p>
            <div className="temp">{Math.round(weather.current.temperature_2m)}°C</div>
            <div className="stats">
              <span aria-label="Αίσθηση θερμοκρασίας" title="Αίσθηση θερμοκρασίας">
                🌡️ {Math.round(weather.current.apparent_temperature)}°C
              </span>
              <span aria-label="Άνεμος" title="Ταχύτητα ανέμου">
                💨 {Math.round(weather.current.wind_speed_10m)} km/h
              </span>
              <span aria-label="Ριπές ανέμου" title="Μέγιστες ριπές ανέμου">
                🌬️ {Math.round(weather.current.wind_gusts_10m)} km/h
              </span>
              <span aria-label="Διεύθυνση ανέμου" title="Διεύθυνση ανέμου">
                🧭 {windDirectionToText(weather.current.wind_direction_10m)} (
                {Math.round(weather.current.wind_direction_10m)}°)
              </span>
              <span aria-label="Υγρασία" title="Σχετική υγρασία">
                💧 {weather.current.relative_humidity_2m}%
              </span>
              <span aria-label="Νεφοκάλυψη" title="Ποσοστό νεφοκάλυψης">
                ☁️ {weather.current.cloud_cover}%
              </span>
              <span aria-label="Βροχόπτωση" title="Τρέχουσα βροχόπτωση">
                🌧️ {weather.current.precipitation.toFixed(1)} mm
              </span>
              <span aria-label="UV δείκτης" title="Δείκτης υπεριώδους ακτινοβολίας">
                🟣 {weather.current.uv_index.toFixed(1)}
              </span>
              <span aria-label="Πίεση" title="Ατμοσφαιρική πίεση">
                🔽 {Math.round(weather.current.surface_pressure)} hPa
              </span>
              <span aria-label="Ώρα ενημέρωσης" title="Ώρα τελευταίας ενημέρωσης δεδομένων">
                🕒 {fmtTime(weather.current.time)}
              </span>
            </div>
          </section>

          <section className="card forecast">
            <h3>Πρόγνωση 7 ημερών</h3>
            <ul>
              {dailyRows.map((row) => (
                <li
                  key={row.day}
                  className="forecast-row"
                  title={`Πρόγνωση για ${fmtDate(row.day)}`}
                >
                  <button
                    type="button"
                    className={`day-button ${selectedDay === row.day ? 'active' : ''}`}
                    title="Κλικ για ημερήσια διακύμανση θερμοκρασίας"
                    onClick={() => setSelectedDay(row.day)}
                  >
                    {fmtDate(row.day)}
                  </button>
                  <span className="forecast-condition">
                    <span className="forecast-icon-wrap">
                      <WeatherIcon
                        className={`weather-icon icon-sm icon-${weatherCodeToIcon(row.code)}`}
                        kind={weatherCodeToIcon(row.code)}
                      />
                    </span>
                    <span>{weatherCodeToText[row.code] ?? 'Άγνωστο'}</span>
                  </span>
                  <span>
                    {Math.round(row.max)}°C / {Math.round(row.min)}°C
                  </span>
                  <span
                    className={`rain-indicator rain-${rainChanceLevel(row.rainChance)}`}
                    title={`Πιθανότητα βροχής ${row.rainChance}%`}
                    aria-label={`Πιθανότητα βροχής ${row.rainChance}%`}
                  >
                    <span className="rain-dot" />
                    {row.rainChance}%
                  </span>
                </li>
              ))}
            </ul>
            {selectedDayRow && (
              <section className="day-range" title="Ημερήσια διακύμανση θερμοκρασίας">
                <p className="day-range-title">
                  {fmtDate(selectedDayRow.day)}: {Math.round(selectedDayRow.min)}°C -{' '}
                  {Math.round(selectedDayRow.max)}°C (Διακύμανση{' '}
                  {Math.round(selectedDayRow.max - selectedDayRow.min)}°C)
                </p>
                {weeklyTempBounds && (
                  <div className="temp-chart" aria-label="Γράφημα θερμοκρασίας ημέρας">
                    <div className="temp-chart-scale">
                      <span>{Math.round(weeklyTempBounds.min)}°C</span>
                      <span>{Math.round(weeklyTempBounds.max)}°C</span>
                    </div>
                    <div
                      className={`temp-track ${isChartDragging ? 'dragging' : ''}`}
                      title="Tap ή σύρε για επιλογή ημέρας"
                      role="slider"
                      aria-label="Επιλογή ημέρας για θερμοκρασιακή διακύμανση"
                      aria-valuemin={1}
                      aria-valuemax={dailyRows.length}
                      aria-valuenow={Math.max(1, selectedDayIndex + 1)}
                      onPointerDown={(event) => {
                        setIsChartDragging(true)
                        event.currentTarget.setPointerCapture(event.pointerId)
                        updateSelectedDayFromPointer(event)
                      }}
                      onPointerMove={(event) => {
                        if (!isChartDragging) {
                          return
                        }
                        updateSelectedDayFromPointer(event)
                      }}
                      onPointerUp={(event) => {
                        setIsChartDragging(false)
                        event.currentTarget.releasePointerCapture(event.pointerId)
                      }}
                      onPointerCancel={() => setIsChartDragging(false)}
                    >
                      <div
                        className="temp-range"
                        style={{
                          left: `${((selectedDayRow.min - weeklyTempBounds.min) / (weeklyTempBounds.max - weeklyTempBounds.min || 1)) * 100}%`,
                          width: `${((selectedDayRow.max - selectedDayRow.min) / (weeklyTempBounds.max - weeklyTempBounds.min || 1)) * 100}%`,
                        }}
                      />
                      {selectedDayIndex >= 0 && dailyRows.length > 1 && (
                        <div
                          className="temp-handle"
                          style={{
                            left: `${(selectedDayIndex / (dailyRows.length - 1)) * 100}%`,
                          }}
                        />
                      )}
                    </div>
                  </div>
                )}
              </section>
            )}
            {selectedDayHourlyRows.length > 0 && (
              <section className="hourly" title="Ωριαία δεδομένα">
                <div className="hourly-head">
                  <h4>{hourlyStep === 1 ? 'Ανά ώρα' : 'Ανά 3 ώρες'}</h4>
                  <div className="hourly-toggle" role="group" aria-label="Βήμα ωριαίας προβολής">
                    <button
                      type="button"
                      className={hourlyStep === 1 ? 'active' : ''}
                      onClick={() => setHourlyStep(1)}
                      title="Προβολή ανά 1 ώρα"
                    >
                      1h
                    </button>
                    <button
                      type="button"
                      className={hourlyStep === 3 ? 'active' : ''}
                      onClick={() => setHourlyStep(3)}
                      title="Προβολή ανά 3 ώρες"
                    >
                      3h
                    </button>
                  </div>
                </div>
                {loading || geoLoading ? (
                  <div className="hourly-list">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <article
                        key={`skeleton-${index}`}
                        className="hourly-item hourly-item-skeleton"
                        aria-hidden="true"
                      >
                        <p className="skeleton-line short" />
                        <p className="skeleton-line icon" />
                        <p className="skeleton-line" />
                        <p className="skeleton-line short" />
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="hourly-list">
                    {visibleHourlyRows.map((row) => (
                    <article key={row.time} className="hourly-item" title={`Ώρα ${row.hourLabel}`}>
                      <p className="hourly-time">{row.hourLabel}</p>
                      <p className="hourly-icon" aria-hidden="true">
                        <WeatherIcon
                          className={`weather-icon icon-sm icon-${weatherCodeToIcon(row.code)}`}
                          kind={weatherCodeToIcon(row.code)}
                        />
                      </p>
                      <p>🌡️ {Math.round(row.temp)}°C</p>
                      <p>🌧️ {Math.round(row.rainChance)}%</p>
                    </article>
                  ))}
                  </div>
                )}
              </section>
            )}
          </section>
        </>
      )}
    </main>
  )
}

export default App
