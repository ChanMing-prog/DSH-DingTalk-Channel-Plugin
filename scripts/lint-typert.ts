#!/usr/bin/env node
/**
 * lint:typert — manifest vs schema vs locale consistency check.
 *
 * Runs the same validation as tests/typert.test.ts but exit-codes for CI.
 *
 * Usage:
 *   tsx scripts/lint-typert.ts
 *   pnpm lint:typert
 *
 * Exit codes:
 *   0 = all ok
 *   1 = errors found (printed)
 *   2 = setup problem (missing manifest, etc.)
 */

import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

// 1. 加载本仓库产物（tsc 编译过的）
//    因为本仓库 src 是 TypeScript 源码，没装 tsx 来跑 ts 文件，
//    而 settings-schema.ts 暴露 schema 字段名（已在 PR-5 PR-6 写过）。
//    我们直接 enum 关键字段名 + 跑 manifest lint.

const TOP_LEVEL_FIELDS = [
  'enabled',
  'defaultAccount',
  'clientId',
  'clientSecret',
  'enableMediaUpload',
  'systemPrompt',
  'dmPolicy',
  'allowFrom',
  'groupPolicy',
  'groupAllowFrom',
  'requireMention',
  'groups',
  'historyLimit',
  'textChunkLimit',
  'mediaMaxMb',
  'routes',
  'accounts',
  'bindings',
  'inboxWakeup',
  'streamTimeoutMs',
  'jobsControllerName',
  'aiCardReuseMs',
  'toolsOnly',
]

async function main() {
  // 用 tsx loader 跑 ts（如果装了的话）
  // 没装 tsx 的话直接用 ts 编译后的 dist
  try {
    const { lintTypert } = await import(
      resolve(root, 'dist/typert/loader-contract.js')
    )
    const result = lintTypert(TOP_LEVEL_FIELDS)

    console.log('🩺 Typert Lint Report')
    console.log('═══════════════════════')
    console.log(`Manifest:  ${result.manifest.ok ? '✅' : '❌'} (${result.manifest.errors.length} errors, ${result.manifest.warnings.length} warnings)`)
    console.log(`Sections:  ${result.manifest.stats.sectionCount} (${result.manifest.stats.fieldCount} fields)`)
    console.log(`Locales:   ${result.manifest.stats.localeCount} (${result.manifest.stats.localeKeyCount} keys base)`)

    if (result.manifest.errors.length > 0) {
      console.log('\nManifest errors:')
      for (const e of result.manifest.errors) console.log(`  ❌ ${e.path}: ${e.message}`)
    }
    if (result.manifest.warnings.length > 0) {
      console.log('\nManifest warnings:')
      for (const w of result.manifest.warnings) console.log(`  ⚠️  ${w.path}: ${w.message}`)
    }

    if (result.schemaCover.uncovered.length > 0) {
      console.log('\nSchema fields not in any section:')
      for (const f of result.schemaCover.uncovered) console.log(`  ❌ ${f}`)
    }
    if (result.schemaCover.orphan.length > 0) {
      console.log('\nSection fields not in schema:')
      for (const f of result.schemaCover.orphan) console.log(`  ⚠️  ${f}`)
    }

    console.log('\nLocale coverage:')
    for (const [code, cov] of Object.entries(result.localeDrift.coverageByLocale)) {
      const pct = (cov * 100).toFixed(1)
      console.log(`  ${code}: ${pct}%`)
    }

    if (!result.ok) {
      console.log('\n❌ lint failed')
      process.exit(1)
    } else {
      console.log('\n✅ lint passed')
      process.exit(0)
    }
  } catch (err) {
    console.error('Failed to run lint (is dist/ built?):', err)
    process.exit(2)
  }
}

main()