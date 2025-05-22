/**
 * Reports web vitals performance metrics if a performance entry handler is provided.
 * It dynamically imports the 'web-vitals' library and registers the handler
 * for metrics like CLS, INP, FCP, LCP, and TTFB.
 *
 * @param {() => void} [onPerfEntry] - Optional callback function to handle performance entries.
 */
const reportWebVitals = (onPerfEntry?: () => void) => {
	if (onPerfEntry && onPerfEntry instanceof Function) {
		import("web-vitals").then(({ onCLS, onINP, onFCP, onLCP, onTTFB }) => {
			onCLS(onPerfEntry);
			onINP(onPerfEntry);
			onFCP(onPerfEntry);
			onLCP(onPerfEntry);
			onTTFB(onPerfEntry);
		});
	}
};

export default reportWebVitals;
