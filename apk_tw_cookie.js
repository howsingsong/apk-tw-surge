/*
 * APK.TW Cookie 自動擷取
 * Author: howsingsong
 */

const COOKIE_KEY = "APK_TW_COOKIE";
const FORMHASH_KEY = "APK_TW_FORMHASH";
const AUTH_KEY = "APK_TW_AUTH";

function getHeader(headers, target) {
  if (!headers) return "";

  const keys = Object.keys(headers);

  for (let i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === target.toLowerCase()) {
      const value = headers[keys[i]];

      if (Array.isArray(value)) {
        return value.join("; ");
      }

      return String(value || "");
    }
  }

  return "";
}

function getAuthCookie(cookie) {
  if (!cookie) return "";

  const parts = cookie.split(/;\s*/);

  for (let i = 0; i < parts.length; i++) {
    const pos = parts[i].indexOf("=");

    if (pos === -1) continue;

    const name = parts[i].substring(0, pos).trim();
    const value = parts[i].substring(pos + 1);

    if (/_auth$/i.test(name) && value) {
      return name + "=" + value;
    }
  }

  return "";
}

try {
  const headers = $request.headers || {};
  const cookie = getHeader(headers, "cookie");
  const url = $request.url || "";

  const authCookie = getAuthCookie(cookie);

  /*
   * 只有真正包含登入 auth Cookie 時才更新，
   * 避免訪客 Cookie 覆蓋已登入 Cookie。
   */
  if (cookie && authCookie) {
    const oldAuth = $persistentStore.read(AUTH_KEY);

    $persistentStore.write(cookie, COOKIE_KEY);
    $persistentStore.write(authCookie, AUTH_KEY);

    console.log("APK.TW：登入 Cookie 已擷取");

    if (!oldAuth) {
      $notification.post(
        "APK.TW",
        "登入資料擷取成功",
        "已儲存登入 Cookie，可以使用自動簽到。"
      );
    } else if (oldAuth !== authCookie) {
      $notification.post(
        "APK.TW",
        "登入資料已更新",
        "偵測到新的登入 Cookie，已自動更新。"
      );
    }
  }

  /*
   * 如果目前請求本身帶有 formhash，
   * 順便保存做為備用。
   */
  const match = url.match(/[?&]formhash=([^&#]+)/i);

  if (match && match[1]) {
    let hash = match[1];

    try {
      hash = decodeURIComponent(hash);
    } catch (e) {}

    if (hash) {
      $persistentStore.write(hash, FORMHASH_KEY);
      console.log("APK.TW：formhash 已更新");
    }
  }
} catch (e) {
  console.log("APK.TW Cookie 擷取錯誤：" + e);
}

$done({});
