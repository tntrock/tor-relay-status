/**
 * 唯一需要編輯的設定檔。
 * 要加第二台 relay，往 RELAYS 加一筆就好，頁面會自動長出切換頁籤。
 */

export const RELAYS = [
  {
    fingerprint: "6940E0224E550AD368EAB57C768EA2958F5C2337",
    label: "AllenInfoSec",
  },
];

/**
 * 同網域的 Cloudflare Pages Function。
 * 瀏覽器只連本站，不會直接連 torproject.org，
 * 所以網路被擋住 onionoo 的訪客一樣看得到資料。
 */
export const API_BASE = "/api/onionoo";

export const SITE = {
  brand: "AllenInfoSec",
  /** 顯示在頁尾的聯絡方式，留空則不顯示 */
  contact: "tor@info-sec.vip",
};
