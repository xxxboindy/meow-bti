import { calcDimensionScores, parsePattern, scoresToLevels, determineResult } from './engine.js'
import { createQuiz } from './quiz.js'
import { renderResult } from './result.js'

import questionsData from '../data/questions.json'
import dimensionsData from '../data/dimensions.json'
import typesData from '../data/types.json'
import configData from '../data/config.json'

// 密钥门：页面只存密钥的 SHA-256 哈希，不存明文
const GATE_HASH = '3ffd8921dec5677fd53682577ff5ee7ab026ccaf2abd5ed7b0a5af638d596322'
const GATE_STORAGE = 'meowbti_unlocked'

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function initGate() {
  const gate = document.getElementById('gate')
  const input = document.getElementById('gate-input')
  const btn = document.getElementById('gate-btn')
  const err = document.getElementById('gate-error')

  function unlock() {
    gate.classList.add('hidden')
    try {
      localStorage.setItem(GATE_STORAGE, '1')
    } catch (e) {}
  }

  // 支持 ?key=XXXX 自动解锁（可选，卖家可把密钥拼进链接）
  const urlKey = new URLSearchParams(window.location.search).get('key')
  if (urlKey) {
    const h = await sha256Hex(urlKey.trim().toUpperCase())
    if (h === GATE_HASH) {
      unlock()
      return
    }
  }

  // 本浏览器已解锁过，直接进入
  try {
    if (localStorage.getItem(GATE_STORAGE) === '1') {
      unlock()
      return
    }
  } catch (e) {}

  async function check() {
    const val = input.value.trim().toUpperCase()
    if (!val) return
    const h = await sha256Hex(val)
    if (h === GATE_HASH) {
      unlock()
    } else {
      err.style.display = 'block'
      input.value = ''
      input.focus()
    }
  }

  btn.addEventListener('click', check)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') check()
  })
  input.focus()
}

async function init() {
  await initGate()

  const questions = questionsData
  const dimensions = dimensionsData
  const types = typesData
  const config = configData

  const pages = {
    intro: document.getElementById('page-intro'),
    quiz: document.getElementById('page-quiz'),
    result: document.getElementById('page-result'),
  }

  function showPage(name) {
    Object.values(pages).forEach((p) => p.classList.remove('active'))
    pages[name].classList.add('active')
    window.scrollTo(0, 0)
  }

  function onQuizComplete(answers, isCatnipHigh) {
    const scores = calcDimensionScores(answers, questions.main)
    const levels = scoresToLevels(scores, config.scoring.levelThresholds)
    const result = determineResult(levels, dimensions.order, types.standard, types.special, {
      isCatnipHigh,
      maxDistance: config.scoring.maxDistance,
      fallbackThreshold: config.scoring.fallbackThreshold,
    })
    renderResult(result, levels, dimensions.order, dimensions.definitions, config)
    showPage('result')
  }

  const quiz = createQuiz(questions, config, onQuizComplete)
  const previewResult = getPreviewResult(
    new URLSearchParams(window.location.search),
    dimensions.order,
    dimensions.definitions,
    types,
  )

  const ui = config.display?.ui || {}
  if (searchParamsFlag('screenshot')) {
    document.body.classList.add('screenshot-mode')
  }
  if (config.display?.title) {
    document.title = config.display.title
  }
  if (config.display?.subtitle) {
    const descEl = document.querySelector('meta[name="description"]')
    if (descEl) descEl.setAttribute('content', config.display.subtitle)
  }
  if (ui.introTitleHtml) {
    document.getElementById('intro-title').innerHTML = ui.introTitleHtml
  }
  const leadEl = document.getElementById('intro-lead')
  if (leadEl && ui.introLead) {
    leadEl.textContent = ui.introLead
  }

  if (previewResult) {
    renderResult(
      previewResult.result,
      previewResult.levels,
      dimensions.order,
      dimensions.definitions,
      config,
    )
    showPage('result')
    return
  }

  // 首页点「开始测我的 Meow BTI」进入答题页
  document.getElementById('btn-start').addEventListener('click', () => {
    quiz.start()
    showPage('quiz')
  })

  document.getElementById('btn-restart').addEventListener('click', () => {
    quiz.start()
    showPage('quiz')
  })
}

init()

function getPreviewResult(searchParams, dimOrder, dimDefs, types) {
  const preview = searchParams.get('preview')
  if (!preview) return null

  const baseLevels = makeLevels(dimOrder, 'M')
  const standard = types.standard || []
  const special = types.special || []

  if (preview === 'catnip' || preview === 'drunk') {
    const secondary = standard.find((type) => type.code === 'SIAMESE') || standard[0]
    const catnipType = special.find((type) => type.code === 'SIAMNIP')
    if (!catnipType || !secondary) return null

    return {
      levels: levelsFromType(secondary, dimOrder),
      result: {
        primary: { ...catnipType, similarity: 80, exact: 9 },
        secondary: { ...secondary, similarity: 76, exact: 8 },
        rankings: standard.map((type, index) => ({ ...type, similarity: Math.max(52, 80 - index * 3) })),
        mode: 'catnip',
      },
    }
  }

  if (preview === 'fallback') {
    const fallback = special.find((type) => type.code === 'HHHH')
    const secondary = standard.find((type) => type.code === 'LIHUA') || standard[0]
    if (!fallback || !secondary) return null

    return {
      levels: baseLevels,
      result: {
        primary: { ...fallback, similarity: 58, exact: 6 },
        secondary: { ...secondary, similarity: 58, exact: 6 },
        rankings: standard.map((type, index) => ({ ...type, similarity: Math.max(45, 58 - index * 2) })),
        mode: 'fallback',
      },
    }
  }

  const type = standard.find((item) => item.code === preview.toUpperCase())
  if (!type) return null

  const levels = levelsFromType(type, dimOrder)
  return {
    levels,
    result: {
      primary: { ...type, similarity: 100, exact: 15 },
      secondary: standard[1] ? { ...standard[1], similarity: 86, exact: 10 } : null,
      rankings: standard.map((item, index) => ({
        ...item,
        similarity: item.code === type.code ? 100 : Math.max(55, 88 - index * 2),
      })),
      mode: 'normal',
    },
  }
}

function levelsFromType(type, dimOrder) {
  const values = parsePattern(type.pattern)
  const levels = {}
  dimOrder.forEach((dim, index) => {
    levels[dim] = values[index] || 'M'
  })
  return levels
}

function makeLevels(dimOrder, level) {
  const levels = {}
  dimOrder.forEach((dim) => {
    levels[dim] = level
  })
  return levels
}

function searchParamsFlag(name) {
  return new URLSearchParams(window.location.search).get(name) === '1'
}
