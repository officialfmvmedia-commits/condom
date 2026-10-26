import { useEffect, useRef } from 'react'
import { CandlestickSeries, ColorType, createChart, HistogramSeries, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts'
import type { Candle } from '../lib/registry'

/** Market-cap candles (TradingView lightweight-charts, Apache-2.0). Updates in place on new data. */
export function PriceChart({ candles, unit }: { candles: Candle[]; unit: 'usd' | 'sol' }) {
  const el = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const series = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const vol = useRef<ISeriesApi<'Histogram'> | null>(null)
  const fitted = useRef(false)

  useEffect(() => {
    if (!el.current) return
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#6b7a71', fontFamily: 'Nunito, system-ui, sans-serif', attributionLogo: true },
      grid: { vertLines: { color: 'rgba(0,0,0,.04)' }, horzLines: { color: 'rgba(0,0,0,.05)' } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
    })
    series.current = c.addSeries(CandlestickSeries, {
      upColor: '#009242', downColor: '#e5484d', wickUpColor: '#009242', wickDownColor: '#e5484d', borderVisible: false,
      priceFormat: { type: 'custom', minMove: 0.01, formatter: (p: number) => fmtAxis(p, unit) },
    })
    vol.current = c.addSeries(HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, color: 'rgba(0,146,66,.25)' })
    c.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
    chart.current = c
    fitted.current = false
    return () => { c.remove(); chart.current = null }
  }, [unit])

  useEffect(() => {
    if (!series.current || !vol.current) return
    series.current.setData(candles.map((k) => ({ time: k.time as UTCTimestamp, open: k.open, high: k.high, low: k.low, close: k.close })))
    vol.current.setData(candles.map((k) => ({ time: k.time as UTCTimestamp, value: k.volume, color: k.close >= k.open ? 'rgba(0,146,66,.28)' : 'rgba(229,72,77,.28)' })))
    if (!fitted.current && candles.length) { chart.current?.timeScale().fitContent(); fitted.current = true }
  }, [candles])

  return <div ref={el} className="chart-canvas" />
}

function fmtAxis(p: number, unit: 'usd' | 'sol') {
  const pre = unit === 'usd' ? '$' : ''
  const suf = unit === 'sol' ? ' SOL' : ''
  if (p >= 1e6) return `${pre}${(p / 1e6).toFixed(2)}M${suf}`
  if (p >= 1e3) return `${pre}${(p / 1e3).toFixed(1)}K${suf}`
  return `${pre}${p.toFixed(p >= 10 ? 0 : 2)}${suf}`
}
