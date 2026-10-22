import dotenv from 'dotenv'
import path from 'node:path'

import { defineConfig } from 'vitest/config'

dotenv.config({ path: `.env` })
dotenv.config({ path: `.env.${process.env.NODE_ENV}` })
dotenv.config({ path: `.env.local` })

import { sveltekit } from '@sveltejs/kit/vite'

const SERVER_PORT = parseInt(process.env.PUBLIC_SERVER_PORT || '4000')
const SERVER_HOST = process.env.PUBLIC_SERVER_HOST
const API_URL = process.env.API_URL

const SERVER_ORIGIN = `http://${SERVER_HOST}:${SERVER_PORT}`

export default defineConfig({
  cacheDir: './cache',
  server: {
    host: true,
    port: SERVER_PORT,
    origin: SERVER_ORIGIN,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '1728000'
    }
  },
  plugins: process.env.VITEST ? [] : [sveltekit()],
  resolve: {
    alias: {
      $lib: path.resolve('src/lib'),
      $components: path.resolve('src/components'),
      $helpers: path.resolve('src/helpers'),
      $styles: path.resolve('src/styles'),
      $types: path.resolve('src/types')
    },
    conditions: process.env.VITEST ? ['browser'] : undefined
  },
  test: {
    environment: 'jsdom'
  }
})
