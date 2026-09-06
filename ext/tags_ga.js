(function () {
	// O 'if' verifica se está rodando na web (http ou https)
	if (window.location.protocol.startsWith("http")) {
		const gaMeasurementId = "G-YC51CE6XFE";
		const consentStorageKey = "ga-consent";

		function loadGoogleAnalytics() {
			window.__googleAnalyticsLoaded = true;
			window.dataLayer = window.dataLayer || [];
			window.gtag = function () {
				window.dataLayer.push(arguments);
			};
			window.gtag("js", new Date());
			window.gtag("config", gaMeasurementId);

			const script = document.createElement("script");
			script.async = true;
			script.src = `https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`;
			document.head.appendChild(script);
		}

		function setupAnalyticsConsent() {
			const banner = document.getElementById("cookie-consent");
			const acceptButton = document.getElementById("cookie-consent-accept");
			const rejectButton = document.getElementById("cookie-consent-reject");

			if (!banner || !acceptButton || !rejectButton) return;

			const savedConsent = localStorage.getItem(consentStorageKey);

			if (savedConsent === "accepted") {
				loadGoogleAnalytics();
				return;
			}
			if (savedConsent === "rejected") return;

			banner.hidden = false;
			acceptButton.addEventListener("click", function () {
				localStorage.setItem(consentStorageKey, "accepted");
				banner.hidden = true;
				loadGoogleAnalytics();
			});
			rejectButton.addEventListener("click", function () {
				localStorage.setItem(consentStorageKey, "rejected");
				banner.hidden = true;
			});
		}

		// Inicia a verificação de consentimento quando a página (web) carregar
		document.addEventListener("DOMContentLoaded", setupAnalyticsConsent);
	}
})();
