/**
 * Pairing screen behaviour for the KPH SitePilot connector.
 *
 * Talks only to this site's own REST routes (cookie auth + REST nonce). The
 * platform round-trip happens server-side, so no secret ever touches the browser.
 */
(function () {
	'use strict';

	var config = window.KPH_SP_ADMIN;
	if (!config) {
		return;
	}

	var result = document.getElementById('kph-sp-pairing-result');
	var input = document.getElementById('kph-sp-pairing-code');
	var pairButton = document.getElementById('kph-sp-pair');
	var unpairButton = document.getElementById('kph-sp-unpair');

	function setResult(message, state) {
		if (!result) {
			return;
		}
		result.textContent = message;
		result.className = 'kph-sp-result' + (state ? ' is-' + state : '');
	}

	function request(path, body) {
		return fetch(config.restUrl + path, {
			method: 'POST',
			credentials: 'same-origin',
			headers: {
				'Content-Type': 'application/json',
				'X-WP-Nonce': config.nonce,
			},
			body: JSON.stringify(body || {}),
		}).then(function (response) {
			return response
				.json()
				.catch(function () {
					return {};
				})
				.then(function (data) {
					if (!response.ok) {
						throw new Error(data.message || 'Request failed (' + response.status + ').');
					}
					return data;
				});
		});
	}

	if (pairButton && input) {
		pairButton.addEventListener('click', function () {
			var code = input.value.replace(/[^A-Za-z0-9]/g, '');

			if (code.length !== 8) {
				setResult('Enter the full 8-character code, for example ABCD-EFGH.', 'error');
				input.focus();
				return;
			}

			if (!/^https?:\/\//i.test(config.platformUrl || '')) {
				setResult('Save the SitePilot platform URL first.', 'error');
				return;
			}

			pairButton.disabled = true;
			setResult(config.strings.connecting, 'pending');

			request('pair', { code: code })
				.then(function (data) {
					setResult(data.message || 'Connected.', 'success');
					window.setTimeout(function () {
						window.location.reload();
					}, 1200);
				})
				.catch(function (error) {
					setResult(error.message, 'error');
				})
				.finally(function () {
					pairButton.disabled = false;
				});
		});
	}

	if (unpairButton) {
		unpairButton.addEventListener('click', function () {
			if (!window.confirm('Disconnect this site from SitePilot? New jobs will stop immediately.')) {
				return;
			}

			unpairButton.disabled = true;
			setResult(config.strings.working, 'pending');

			request('unpair', {})
				.then(function (data) {
					setResult(data.message || 'Disconnected.', 'success');
					window.setTimeout(function () {
						window.location.reload();
					}, 1200);
				})
				.catch(function (error) {
					setResult(error.message, 'error');
				})
				.finally(function () {
					unpairButton.disabled = false;
				});
		});
	}
})();
