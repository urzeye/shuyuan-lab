/**
 * CF Turnstile CDP Patcher
 *
 * 修复 Chrome CDP Input.dispatchMouseEvent bug + 自动检测 Turnstile checkbox
 *
 * 两大核心功能:
 *   1. 覆盖 MouseEvent.prototype.screenX/screenY，修复 CDP 模拟鼠标事件时
 *      screenX===clientX 的异常（Chromium Issue #40280325）
 *   2. 挂钩 Element.prototype.attachShadow，自动检测 Turnstile checkbox 位置
 *      并通过 postMessage 广播给自动化工具
 *
 * 架构参考:
 *   - ObjectAscended/CDP-bug-MouseEvent-.screenX-.screenY-patcher (CDP bug 修复)
 *   - tenacious6/cf-autoclick (attachShadow hook + 位置比率检测)
 *   - https://www.52pojie.cn/thread-2097555-1-1.html (Shadow DOM 定位 + Bezier 点击)
 */

(function () {
	'use strict';

	// ── Part 1: 修复 CDP MouseEvent screenX/screenY bug ──

	function getRandomInt(min, max) {
		return Math.floor(Math.random() * (max - min + 1)) + min;
	}

	var _fallbackScreenX = getRandomInt(800, 1200);
	var _fallbackScreenY = getRandomInt(400, 600);

	try {
		Object.defineProperty(MouseEvent.prototype, 'screenX', {
			get: function () {
				var winScreenX = (window.screenX !== undefined) ? window.screenX : (window.screenLeft || 0);
				return winScreenX + this.clientX;
			},
			configurable: true
		});
	} catch (e) {
		try {
			Object.defineProperty(MouseEvent.prototype, 'screenX', { value: _fallbackScreenX });
		} catch (e2) { /* 静默失败 */ }
	}

	try {
		Object.defineProperty(MouseEvent.prototype, 'screenY', {
			get: function () {
				var winScreenY = (window.screenY !== undefined) ? window.screenY : (window.screenTop || 0);
				var chromeHeight = (window.outerHeight - window.innerHeight) || 80;
				return winScreenY + this.clientY + chromeHeight;
			},
			configurable: true
		});
	} catch (e) {
		try {
			Object.defineProperty(MouseEvent.prototype, 'screenY', { value: _fallbackScreenY });
		} catch (e2) { /* 静默失败 */ }
	}

	// 同时覆盖 PointerEvent
	try {
		Object.defineProperty(PointerEvent.prototype, 'screenX', {
			get: function () {
				var winScreenX = (window.screenX !== undefined) ? window.screenX : (window.screenLeft || 0);
				return winScreenX + this.clientX;
			},
			configurable: true
		});
	} catch (e) { /* 静默失败 */ }

	try {
		Object.defineProperty(PointerEvent.prototype, 'screenY', {
			get: function () {
				var winScreenY = (window.screenY !== undefined) ? window.screenY : (window.screenTop || 0);
				var chromeHeight = (window.outerHeight - window.innerHeight) || 80;
				return winScreenY + this.clientY + chromeHeight;
			},
			configurable: true
		});
	} catch (e) { /* 静默失败 */ }

	console.debug('[CF-Turnstile-Patcher] CDP MouseEvent screenX/screenY bug 已修复');

	// ── Part 2: attachShadow Hook ──
	// 参考: tenacious6/cf-autoclick 的 injected.js

	function getNativeAttachShadow() {
		// content script runs at document_start, where document.body may not exist.
		// Capture the untouched prototype method directly before installing our hook.
		return Element.prototype.attachShadow;
	}

	var _nativeAttachShadow = getNativeAttachShadow();
	if (_nativeAttachShadow) {
		Element.prototype.attachShadow = function () {
			var args = arguments;
			var shadowRoot = _nativeAttachShadow.apply(this, args);

			if (shadowRoot) {
				var existingCheckbox = shadowRoot.querySelector('input[type="checkbox"]');
				if (existingCheckbox) {
					window.__cfTurnstileCheckbox = existingCheckbox;
					reportCheckboxPosition(existingCheckbox);
				} else {
					var observer = new MutationObserver(function (mutations, obs) {
						var checkbox = shadowRoot.querySelector('input[type="checkbox"]');
						if (checkbox) {
							window.__cfTurnstileCheckbox = checkbox;
							reportCheckboxPosition(checkbox);
							obs.disconnect();
						}
					});
					observer.observe(shadowRoot, {
						childList: true,
						subtree: true
					});
				}
			}
			return shadowRoot;
		};
	}

	function reportCheckboxPosition(checkbox) {
		try {
			var rect = checkbox.getBoundingClientRect();
			var windowWidth = window.innerWidth;
			var windowHeight = window.innerHeight;

			if (windowWidth > 0 && windowHeight > 0) {
				var centerX = rect.left + rect.width / 2;
				var centerY = rect.top + rect.height / 2;

				window.__cfCheckboxInfo = {
					x: centerX,
					y: centerY,
					xRatio: centerX / windowWidth,
					yRatio: centerY / windowHeight,
					width: rect.width,
					height: rect.height,
					timestamp: Date.now()
				};

				window.postMessage({
					type: 'CF_TURNSTILE_CHECKBOX_DETECTED',
					payload: window.__cfCheckboxInfo
				}, '*');

				console.debug(
					'[CF-Turnstile-Patcher] 检测到 Turnstile checkbox',
					'位置:', Math.round(centerX), 'x', Math.round(centerY),
					'比率:', window.__cfCheckboxInfo.xRatio.toFixed(3), 'x', window.__cfCheckboxInfo.yRatio.toFixed(3)
				);
			}
		} catch (e) {
			// 跨域 iframe 可能无法获取位置
		}
	}

	console.debug('[CF-Turnstile-Patcher] attachShadow hook 已就绪');
})();
