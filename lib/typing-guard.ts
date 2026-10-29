// 글을 치는 도중 이미 쓴 글자·낱말이 사라지던 문제 (헬레나 오류 신고, 아이폰: '캡쳐'를 치는데 '캡'이 사라지고 '쳐'만 남음)
// 아이폰·아이패드 한글 자판은 지금 조합 중인 글자(받침이 다음 글자로 옮겨 갈 수 있는 '캡' 같은)를 자판 안에 따로 기억하며 입력칸을 고친다.
// 그 사이 앱이 화면을 다시 그리면(1분마다 알림 확인·새 메시지·대화방 확인 등) React 가 입력칸 값을 '자기가 마지막으로 안 값'으로
// 되돌려 쓸 수 있고, 사파리는 조합 중에 값이 바뀌면 조합하던 글자를 지우며, 자판도 바뀐 줄 모르고 엉뚱한 글자를 지운다.
// 그래서 두 가지를 한다:
//  1) 화면을 그리기 전에(head, React 보다 먼저) 입력칸의 value 쓰기를 감싼다: 지금 글을 치는 입력칸에 '마지막으로 알려진 값'을 다시 쓰려는 것
//     (= 사용자가 그 뒤에 친 글자를 되돌리는 것)은 하지 않고, 대신 input 이벤트를 한 번 보내 앱이 지금 글을 알게 한다.
//     '마지막으로 알려진 값' = 마지막 input 이벤트 때의 값이나 마지막으로 앱이 쓴 값 (React 가 알고 있는 값과 같음).
//     앱이 일부러 바꾸는 값(보낸 뒤 비우기·이모티콘·@태그 넣기 등)은 마지막으로 알려진 값과 달라서 그대로 된다.
//  2) 글을 치는 동안(입력칸에 커서가 있고 마지막 글자 뒤 4초 안)은 주기적으로 새로 불러오는 일을 미뤄(afterTyping) 화면을 덜 다시 그린다.
//     바뀐 것이 없으면 다시 그리지 않게(same) 하는 곳도 함께.
export const TYPING_GUARD_SCRIPT = `(function(){try{
var W=window,seen=new WeakMap();
var textLike=function(el){if(el instanceof HTMLTextAreaElement)return true;if(!(el instanceof HTMLInputElement))return false;var t=el.type;return t==='text'||t==='search'||t==='email'||t==='url'||t==='tel';};
var mark=function(e){if(textLike(e.target))W.__typingAt=Date.now();};
document.addEventListener('input',function(e){var el=e.target;if(!textLike(el))return;seen.set(el,el.value);if(e.isTrusted)W.__typingAt=Date.now();},true);
document.addEventListener('keydown',mark,true);
document.addEventListener('compositionstart',function(e){W.__composing=true;mark(e);},true);
document.addEventListener('compositionupdate',mark,true);
document.addEventListener('compositionend',function(e){W.__composing=false;mark(e);},true);
document.addEventListener('focusout',function(){W.__composing=false;},true);
[HTMLTextAreaElement.prototype,HTMLInputElement.prototype].forEach(function(P){
var d=Object.getOwnPropertyDescriptor(P,'value');if(!d||!d.set||!d.get)return;
Object.defineProperty(P,'value',{configurable:true,enumerable:d.enumerable,get:d.get,set:function(v){
var s=String(v),el=this;
if(el===document.activeElement&&textLike(el)&&seen.has(el)&&s===seen.get(el)&&d.get.call(el)!==s){
W.__typingGuardHits=(W.__typingGuardHits||0)+1;
setTimeout(function(){if(el.isConnected&&d.get.call(el)!==seen.get(el))el.dispatchEvent(new Event('input',{bubbles:true}));},0);
return;}
d.set.call(el,v);if(textLike(el))seen.set(el,d.get.call(el));}});
});
}catch(e){}})();`;

type TypingWindow = Window & { __typingAt?: number; __composing?: boolean };

// 지금 글을 치는 중인지: 입력칸에 커서가 있고 (한글 조합 중이거나) 마지막 글자 뒤 4초가 안 지났으면
export function typingNow(quietMs = 4000) {
  if (typeof window === 'undefined') return false;
  const el = document.activeElement as HTMLElement | null;
  if (!el || !(el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable)) return false;
  const w = window as TypingWindow;
  return !!w.__composing || Date.now() - (w.__typingAt || 0) < quietMs;
}

// 글을 치는 중이면 손을 멈출 때까지 기다렸다가 (1.5초마다 다시 확인) 한다. 같은 key 는 기다리는 것이 하나만
const waiting = new Set<string>();
export function afterTyping(key: string, fn: () => void) {
  if (!typingNow()) { fn(); return; }
  if (waiting.has(key)) return;
  waiting.add(key);
  const check = () => {
    if (typingNow()) { setTimeout(check, 1500); return; }
    waiting.delete(key);
    fn();
  };
  setTimeout(check, 1500);
}

// 화면에 보이는 입력칸에 아직 보내지 않은 글이 있는지 (새 버전 새로고침 등으로 쓰던 글이 날아가지 않게)
export function hasUnsentText() {
  if (typeof document === 'undefined') return false;
  return [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('textarea, input[type=text], input:not([type])')]
    .some(el => el.value.trim() && el.offsetParent !== null && !el.readOnly);
}

// 새로 받은 것이 지금 것과 같으면 지금 것을 그대로 (setState 에 같은 것을 주면 React 가 다시 그리지 않음)
export function same<T>(prev: T, next: T): T {
  try { return JSON.stringify(prev) === JSON.stringify(next) ? prev : next; } catch { return next; }
}
