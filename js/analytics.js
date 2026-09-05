const STORAGE_KEY = 'neuroai:analytics:v1';

/**
 * Funnel analytics tối giản. Mặc định chỉ giữ aggregate ở trình duyệt.
 * Khi deploy có thể khai báo <meta name="analytics-endpoint"> để POST event
 * ẩn danh lên endpoint riêng mà không phải sửa code luồng sản phẩm.
 */
export function track(name, properties = {}) {
  const event = { name, properties, at: Date.now() };
  try {
    const aggregate = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    aggregate[name] = (aggregate[name] || 0) + 1;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(aggregate));
  } catch { /* analytics không được phép làm hỏng trải nghiệm */ }

  globalThis.dispatchEvent?.(new CustomEvent('neuro-lab:analytics', { detail: event }));
  const endpoint = document.querySelector('meta[name="analytics-endpoint"]')?.content;
  if (endpoint) {
    const body = JSON.stringify(event);
    if (navigator.sendBeacon) navigator.sendBeacon(endpoint, body);
    else fetch(endpoint, { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => {});
  }
}
