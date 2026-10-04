import type { Post } from "./types";

export const samplePosts: Post[] = [
  {
    id: "p1",
    author: "김은혜",
    handle: "eunhye",
    initials: "은혜",
    createdAt: "12분 전",
    text: "오늘 아침 예배 중에 마음이 참 따뜻해졌어요. 서로를 위해 기도하는 시간이 얼마나 귀한지 다시 느낍니다. 지친 분들께 작은 위로가 전해지길 바라요.",
    images: [
      "https://images.unsplash.com/photo-1507692049790-de58290a4334?w=1200&q=80",
    ],
    prayers: 24,
    empathy: 18,
    comments: [
      { id: "c1", author: "이수아", text: "저도 같이 기도할게요. 평안하시길 바랍니다." },
    ],
    prayed: false,
    empathized: false,
  },
  {
    id: "p2",
    author: "박도현",
    handle: "dohyun",
    initials: "도현",
    createdAt: "1시간 전",
    text: "이번 주 소그룹에서 나눈 이야기입니다. 혼자라고 느껴질 때도 있지만, 이렇게 한 공간에서 마음을 나눌 수 있어 감사합니다.",
    images: [
      "https://images.unsplash.com/photo-1529070538774-1843cb3265df?w=800&q=80",
      "https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=800&q=80",
      "https://images.unsplash.com/photo-1478144592103-25e218a04891?w=800&q=80",
    ],
    prayers: 41,
    empathy: 33,
    comments: [
      { id: "c2", author: "최민지", text: "공감해요. 저도 같은 마음이었어요." },
      { id: "c3", author: "정하린", text: "함께여서 든든합니다 🙌" },
    ],
    prayed: false,
    empathized: false,
  },
  {
    id: "p3",
    author: "이하린",
    handle: "harin",
    initials: "하린",
    createdAt: "어제",
    text: "시험 기간이라 마음이 조급했는데, 잠깐 멈춰 서서 숨을 고르니 조금 나아졌어요. 기도 부탁드려요.",
    images: [],
    prayers: 57,
    empathy: 46,
    comments: [],
    prayed: false,
    empathized: false,
  },
];
