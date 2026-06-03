'use client'
import { useEffect } from 'react'

export default function UmnicoWidget() {
  useEffect(() => {
    const a = document.createElement('a')
    a.href = 'https://umnico.com/?utm_source=widget&utm_medium=online_chat&utm_campaign=button'
    a.target = '_blank'
    a.draggable = false
    a.setAttribute('data-umnico-logo', 'true')
    a.setAttribute('style', 'position:fixed !important;right:38px !important;bottom:25px !important;z-index:2147483646 !important;display:flex !important;align-items:center !important;justify-content:center !important;padding-top:1px !important;padding-bottom:2px !important;background-color:rgba(227, 237, 243, 0.4) !important;border-radius:41px !important;cursor:pointer !important')
    const img = document.createElement('img')
    img.src = 'https://umnico.com/assets/index/umnico1.svg'
    img.alt = 'Umnico logo'
    img.draggable = false
    img.setAttribute('style', 'width:45px !important;height:9px !important')
    a.appendChild(img)
    document.body.appendChild(a)

    const loader = document.createElement('div')
    loader.setAttribute('data-umnico-loader', 'true')
    loader.setAttribute('style', 'all: initial;position:fixed !important;right:37px !important;bottom:9px !important;z-index:2147483646 !important;font-family:sans-serif !important;font-size:10px !important;line-height:1 !important;font-weight:bold !important;padding:2px 4px 1px !important;background-color:rgba(227, 237, 243, 0.4) !important;border-radius:41px !important')
    loader.textContent = 'Loading'
    document.body.appendChild(loader)

    ;(document as any).umnicoWidgetHash = '59018708dd7a418abf3e40cd543717d7'
    const script = document.createElement('script')
    script.src = 'https://umnico.com/assets/widget-loader.js'
    script.type = 'text/javascript'
    script.charset = 'UTF-8'
    script.async = true
    document.body.appendChild(script)
  }, [])

  return null
}
