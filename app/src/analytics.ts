export function initAnalytics(): void {
	// Se não for web (ex: for a extensão do Chrome), aborta a execução silenciosamente
	if (!window.location.protocol.startsWith("http")) {
		return;
	}

	const gaMeasurementId = "G-YC51CE6XFE";
	const consentStorageKey = "ga-consent";

	function loadGoogleAnalytics() {
		(window as any).__googleAnalyticsLoaded = true;
		(window as any).dataLayer = (window as any).dataLayer || [];
		(window as any).gtag = function () {
			(window as any).dataLayer.push(arguments);
		};
		(window as any).gtag("js", new Date());
		(window as any).gtag("config", gaMeasurementId);

		const script = document.createElement("script");
		script.async = true;
		script.src = `https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`;
		document.head.appendChild(script);
	}

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

	// Só exibe o banner se estiver na web e não houver consentimento
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
