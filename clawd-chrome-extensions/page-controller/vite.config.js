// @ts-check
import chalk from 'chalk'
import { dirname, resolve } from 'path'
import dts from 'unplugin-dts/vite'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'

const __dirname = dirname(fileURLToPath(import.meta.url))

console.log(chalk.cyan(`📦 Building @page-agent/page-controller`))

export default defineConfig({
	clearScreen: false,
	plugins: [
		dts({ tsconfigPath: './tsconfig.dts.json', bundleTypes: true }),
		// relativeCSSInjection:false injects ALL CSS into the main entry chunk —
		// needed because SimulatorMask is lazy-loaded (dynamic import) and the
		// relative mode can't trace CSS from dynamic chunks, leaving it orphaned.
		cssInjectedByJsPlugin({ relativeCSSInjection: false }),
	],
	publicDir: false,
	esbuild: {
		keepNames: true,
	},
	build: {
		lib: {
			entry: resolve(__dirname, 'src/PageController.ts'),
			name: 'PageController',
			fileName: 'page-controller',
			formats: ['es'],
		},
		outDir: resolve(__dirname, 'dist', 'lib'),
		rollupOptions: {
			external: ['@page-agent/*', 'ai-motion'],
			onwarn: function (message, handler) {
				if (message.code === 'EVAL') return
				handler(message)
			},
		},
		minify: false,
		sourcemap: true,
		cssCodeSplit: false,
	},
	define: {
		'process.env.NODE_ENV': '"production"',
	},
})
