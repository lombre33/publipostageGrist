// Les polices libres du PDF (extension « polices », qu'active GFS seul) : celles de js/free-fonts.js, lues de jsDelivr (paquet npm `@fontsource/<police>`, à la version EXACTE de la liste) seulement
// quand la personne, devant la fenêtre « Polices du document » (js/pdf-font-plan.js), les inclut. Chaque fichier est comparé à son empreinte SHA-384 (les HASHES, écrits par
// `node outils/polices-libres.mjs --ecrire`) AVANT d'entrer dans pdfMake ; un fichier changé ou remplacé est refusé. Les fichiers sont rendus en TrueType (extensions/polices/woff.js), posés dans
// pdfMake le temps de la session, rien n'est écrit sur le disque ni dans le document.
//    PolicesLibres.load(pdfMake, fonts, { fetcher, hashes }) -> Promise<{ ok: true } | { ok: false, reason, font }>
//      fonts : des entrées de FreeFonts ; reason : 'engine' | 'network' | 'integrity' | 'format' (comme PolicesMarianne.load), `font` : le nom de celle qui a échoué.
//    `fetcher` et `hashes` ne servent qu'aux essais (un faux serveur, des empreintes à eux).
const PolicesLibres = (function () {
  const BASE = 'https://cdn.jsdelivr.net/npm/@fontsource/';
  // Les quatre graisses du PDF : le fichier de Fontsource qui la porte et la lettre de `styles` (js/free-fonts.js).
  const STYLES = { normal: ['400-normal', 'n'], bold: ['700-normal', 'b'], italics: ['400-italic', 'i'], bolditalics: ['700-italic', 'j'] };
  // La graisse qui en tient lieu quand le paquet ne la porte pas : la plus proche, puis le normal.
  const FALLBACK = { bold: ['normal'], italics: ['normal'], bolditalics: ['bold', 'italics', 'normal'] };
  // <generated:hashes>
    const HASHES = {
      'open-sans': { normal: 'sha384-Seg7/LzgpdM/9ZAberrvcA8iQqq5ZgSpmfhgs2iRZCbsFRgg5JwHE8b0jNIhJDgJ', bold: 'sha384-DMqA8FRM/oEi1IC/u//ZFMoaipA9h9WbStdAIlPA+dMfiNWiyBnq/3SFHCkQ1HdB', italics: 'sha384-kOQfvpa218xyZM+GU0UAv4vSPI/RkSvKBeC6gXNtso7OXv+owim6N0vV8aT4Gyq2', bolditalics: 'sha384-uSbc8t+ZU2DWmR+LVyphGT/oryrWZk8f8uAw2Cm1Vg0pKcrZ9L6I6ig0AcqtBdeU' },
      'lato': { normal: 'sha384-7BOoYLdFPmbOL4g3lGqHSZJzpGwlZoyJk9rTHFa6UX6Qbc00uWEMb15XxvH9zby8', bold: 'sha384-F6QzC87aIMe5eLzez8cs7yMvOKd2wnYZ6h3+SD4L77QzdphkPeXUb4iWC8eWMKNV', italics: 'sha384-BqDSZigD083Jm4MvLAGf7FRMt6XDCDHVd+3HrUqAokJdpIOMgFqEfVZqwstO4tUc', bolditalics: 'sha384-uUjkZYVMlqtDWNDsrlSZcPkKq024BMovHjkTgAOYpcjurrGGDtSZIlw2L/JL64zP' },
      'montserrat': { normal: 'sha384-F/ZOGAmx8h6P1gshCb+b8oMXoNnG3ONsMn0AvE3qiqBINP0nhFw91z68UCrz/tz4', bold: 'sha384-0T7ThhjvtmvKJ8xh8de7iU1PzFt0jbX8uS+kFey3qn7FrtkOewCE14IvLc0hVA6w', italics: 'sha384-GKZP89CvlURtpVKKjUJJ7Hcwz4Hpf0koIXoBLVZVJw7SawuMwabS7PxKqLAnPww0', bolditalics: 'sha384-sj+29LRBCRbtXrVZvsPvH+6s8QrO7WVMg+gUpEmkRpoK0QLDajf3ArJpRdnErU5M' },
      'poppins': { normal: 'sha384-Yww2BwrpKUJMt9uu44EP1YHEtN1ti2IT4nv3RY8tsPCWMUHAH74JqfkA2xdfRLjZ', bold: 'sha384-JJKBiw8kZoR0l1h/RKaao7RGjk1olpieAXKjPueuTtQmUGarOxNQbTeMn68JGt/b', italics: 'sha384-sioyMvYOVW/wXQFmS3sU9gKh+WiAEprKk+vn9Pz3q3KmvzUf78XdrZ9otqG1B/e8', bolditalics: 'sha384-mqnwik8pY1mdaRKk5JeZ9nV50yIZ+Vsf3+uz9TVNwUiOmw8juZgRkdYl2lOGkNCj' },
      'inter': { normal: 'sha384-e3arOTSNBLDvHrmcDrNvE4ecZDlFVnXoSZOUpv2jsbhSsthsnxdEPljKGbqFMduJ', bold: 'sha384-BhB53abCTF+CuhEtzX/T52sSuaasKPID0SH+XA5C9FBhsvDQqobqImqpXkDYQQ3w', italics: 'sha384-4wcjCD+but85feYW6mLnKEYFu+X/HH0Hx1Aafkf0vdsD0g8W46nNdktupsBMQAd5', bolditalics: 'sha384-F0ZzyoRXf+zYqiQ2yjQCl7gxDNaIFpnVy+o118YuVPXyjhQjNQWzQ0LuZ3Apjict' },
      'source-sans-3': { normal: 'sha384-y1pTnkVmG7b1aLO+amotajGAEoHkrJP7S88FycLggjX95Np8V0wvNYNJYl0/KdLC', bold: 'sha384-JQhpbZhVQQeZDXmNxLzOT4CmnthaoOTxj3U7q4ryuNEDfTi/a3m1LMay5S4jL651', italics: 'sha384-U287HuEb9oDYQFqMV7pOf8dhqCAa8QcOM8U0157vydq2nxoDpMgI/0YjCDNYRZv3', bolditalics: 'sha384-rUs04JQnHKTGfiW9PFLJmIPhLJTjZFFcivvu9f6pMFNrwoTfcB5XfPn5cVw2jHPv' },
      'noto-sans': { normal: 'sha384-NCTEs76bDIeB2XnclTQ5w5s6A+6g6n0iI/PAuvoTeRobhXharSr7VZmx9Kf4DSmK', bold: 'sha384-6aDNrbyI8VhRDvdq+s9Tc5+HLQTVucVL/E+JYhfccemVFn4iBP/nDeBhTswHT31d', italics: 'sha384-2Cz+pygbew7XnSouBtToHvKVgvQw5jq9YY+PRPEr1kPhU3Q/WED6zg0WKDlsW/1V', bolditalics: 'sha384-GlYGxbwJLwgjHNldX7dwV8tdPnn8KVY1pgtRax5L6HDjdm8Y164MGsfOjCIxjhZo' },
      'raleway': { normal: 'sha384-1zK2Uc47ILeoP3QQJefFi1Cd/9kEYPqVB51XwZL9hpttbBFMVVmBkGhobtCw3g2O', bold: 'sha384-h+xBirCwxjjPLhiQh4cHjzDTZTlnpP7hOirMPq/0kSp6d7DLJNihzflI7OarEYEe', italics: 'sha384-izN+JO2V9VtVgEZPiWMwNTrOFzwK808jvnSe520Pz4BMB9RbVdn5SAVtlG/MViiv', bolditalics: 'sha384-WicHAPVMXveB9a2fCbce20zWF160bmvbCmv7+xxgWjxR9nbXdTlyWjItEX3QP5wb' },
      'nunito': { normal: 'sha384-8rB/gUrnZpPzcre36MU4wWT/rA5r8vP59ZMl3y9rFy8U/UtQdrwXZcV+1G0IByny', bold: 'sha384-bZ6jOaVIg0L2lWMLMU+uWVe+PvgL45n3xWxtfZ++HVRETypXnkx57xddmWh9q/Zq', italics: 'sha384-ASB11lChSq7nkV3P/Ws+tZZ+0U0zaCleTaK1XTu1zg54lyRW0BSrA1gscYD5BFIH', bolditalics: 'sha384-WrNO1xZEJmW9AkJbFmbG+sVQruBZ4e4/ZmZLWIv4ke2diE6Qy1WkROskuGjSgqNE' },
      'nunito-sans': { normal: 'sha384-XNLwgh/3lQoMRAl3zTglLICMXNh3eaiGVJWhQwxgXImtIcCOu1yscTdefa+4P8AS', bold: 'sha384-E3NI06ok/JtdWIEdw2e4S1sJc1/tnB/JrMqv+s+V6JcEY/N/Q0ep4q3t3PoFQySr', italics: 'sha384-OWzS1ZgseshZ5lR3rZPBg6pmZzIJ7P7TwRKXRdeVcJUmJQPlnarFGJkuZkSX8+RB', bolditalics: 'sha384-OO8ZP/bl33h4dIt9Fpum7WOGHJGpY6btrvSCSzUCsfv108ajmt3FHR58zNWpxelQ' },
      'fira-sans': { normal: 'sha384-cguKXqOGuUkRss8ZhOeFlAZe4RVksWVAuu9AIvwpmIFEZSLjVAYtUh3l6ZxCUW9M', bold: 'sha384-oZ7/Tkhd3T29+ZvEcVS9Snj70b1FuAh7qtVBWaQ0A06FFI+d0gRM/YB13xVKYMJG', italics: 'sha384-EQPrJMvxbI1Pb+aXPS/1wZDMtv/IvCREQwdv8gnoUjAO3pU7tkGxi5xexCgGszwY', bolditalics: 'sha384-K2miueZ8t7aobRninQ8PwUC8ScpCFH1CpFUwwJJIRgEqLAM73jzdGxVpyHRp5iwt' },
      'pt-sans': { normal: 'sha384-9ajZkjJbohdd1uKVm6EExmzki84Nm7317jHovlg/4nTFnvS9YZfIoW+xMEvjzRwi', bold: 'sha384-jnrdu6URjra1Dgl50U1aJOPERgiPVe0arU4oy5Q6vZ29iLHMMU1Ls8pjCQGtMVfb', italics: 'sha384-9NSYm6r/nnJgNwZqhb8dbffsgcDmZ70/bten7nijX2VTvzIfgg2/usc5MqufVY2T', bolditalics: 'sha384-Nb3+IBSnpVwDXCglecWaShwqGFjSTwXoIChvkNw0JXQPExkfMeGQvktQ10vrZ3CJ' },
      'work-sans': { normal: 'sha384-RNEZI3MYOxK5WrAN7DnH84B+w9hhuTWqN2VU5An7dYgUGbpSn1lVWkF3uRMge1NH', bold: 'sha384-GooZQ5XZGsABxN2hAQnyKXnzPyMAi6M1et9O9lNwQmbzKIneVdCtylqk1GLCFtHl', italics: 'sha384-EBmE20KreVOb/HGu/axPFdu/1B5oH+pmwSBX8kYxPXBku29Ixjf8xB40HUhqrlx8', bolditalics: 'sha384-BJUCXaV1H3JafbjkbB+XGZpzHy4hhvlQqoUXMS9WCNsuWVMdWkWeChF+5I3McIL3' },
      'dm-sans': { normal: 'sha384-CTaAgRqcvJU5DuRzGrgA7COeKTN30/Cdzew5w0LUGagNsD3BcgcQSMTy+qwrIp6w', bold: 'sha384-n/RuAdPc/DhCx7rObAAgtFBmHOYzZGZhvROfA3lbz7BmmNicN8l0ejyUdw2JTPxp', italics: 'sha384-ylpiQ9i8D77ahLSiWalYJdXaOh9QKZT8zJrdhO+E6ufVaH6Ef74FC8V07eK0SEYY', bolditalics: 'sha384-rJqhTEr87EYX3vkghmWzdns1O5G7Stwd7VQfUIk9lu6Zg0JCiiUmq8lGWu8CEwql' },
      'cabin': { normal: 'sha384-SAvg0dMERgs4mVuKs8oizWiFhD4a/TucjtACopEwfcSGpfUH8cSjCJIib7fMaqzW', bold: 'sha384-kXPjaTvyk8M8D2UKBS+0tGj6sglrjXL4zyNIiuDX7nC9e18dLY1xbDD7fNvRrLHM', italics: 'sha384-eIZQNe9oJWXn7gP+emTMy0tC5dpULe9qPBeLo/a0fTaSBF1M56Xey/umaUV9NJKo', bolditalics: 'sha384-mXRld+XxLwdKZp/sUKPr8RWYJ3Ic17sesbE4a1Wnly7OiaFJZQ4yg2FO2lNXMmEo' },
      'oswald': { normal: 'sha384-+pLhlE6XkAQWahtxyXjyYbvQvxARtBlRn/jjh4iKZsDX3pTBK5Wf61hLwL1xW7EH', bold: 'sha384-hUheEX/Qu61PFWULuFisNAltPg0TW4EcjC39UIi6s8q0vINrLkFZwC0QQrakHeyo' },
      'rubik': { normal: 'sha384-hzGCU98GE10ayQBqyAS1WPnkkuLBlXnEWOHNQv5ukC6fubrKenF5/grjHU5SiKam', bold: 'sha384-sN+qYW8bjrvg2enqAZaKYWkcdeW0LZWzzlaZzgkyY60+YyaGbBQ4PzGrLJnOexWi', italics: 'sha384-wjQaZ/gTXwrn8LRTweLdEjiPQMURIAbzP1wwAf41PsuuQRkg4/jWCTgo7PVBSE6G', bolditalics: 'sha384-krt5NYLiD+OJgCYa5Ti2RfdZNzSnWGaxo/0XWw7DKUqyf6Xv910mgCfvKupvVtyJ' },
      'mulish': { normal: 'sha384-VioHo8xXIkMWYanTJ3AYFritlicMUNK3j7jBXwhEfsXccCLLpteEtWGddYxId4KS', bold: 'sha384-+/XFZxwpepm9c8yizrBRpnb5itury3Eb5knLl4Pnh5nDRjT3mGFLFcFRpYyM3+vd', italics: 'sha384-rP5uPAbt7yut3VTlNK/QDs7ngkN/md6n+1J5cHbP/2/kCN3B89UKfFAxV9/IAe4J', bolditalics: 'sha384-6rMnI/hzpUAmd1xmuzJO6x3Zzs74QPjvQKcMwfLJ0CH7IGmpV7ZfXXb+T2fdO6hW' },
      'quicksand': { normal: 'sha384-CXESLdPrVLfVzY6k5sfFVrvErVjB2+QS865iLbo715veZZGsbQcdOjvlY+/9Jnnf', bold: 'sha384-TKjVJF6OURzzd5peSu6xtJSvOjBQCiMdAKjwjDTKQYJJxACFeZvjQpSsCyB457vU' },
      'karla': { normal: 'sha384-+WNsuC3+/IewIdwLBdkN8MLX5pVUEsO96ng+nesQFui/JCy3bqFIGt3eE8NYpBW7', bold: 'sha384-WB8vPRyvbzgquzmJ4aAiXqAqhwuRxikYu+eDP+a+PnkIxlJSopfqWyvtj8re9BUH', italics: 'sha384-eoc7e8mOxgG0mz1Lf5tvkSmEGkcOhfg9qtc4XEtH7KYsehr1mN9hzGC4T7F8Mjw9', bolditalics: 'sha384-zdksrG3XEfVW6y5Zpl4zDObqhiMoFqUiZmvXfcGzQc84NQZlhURqrXp13ttOK2+g' },
      'ibm-plex-sans': { normal: 'sha384-iGMDYuOqGKs5VdZ2d+9FSjMB6bt0WGIJGzBumkmRDiY3NlMLUdY0zgI6Erlp+cUO', bold: 'sha384-VzD0YsOE0sRiV0Twri8OKP5wzUBZHeDOy2PJFYyB0ffXzjTUkKsB9b8rGiS8PqfV', italics: 'sha384-sj5hBFEAuM57mDazgIDDn41M3n5B9SSnFRo3dsqPJF5iec3cjRenRY3UPuUv8ghc', bolditalics: 'sha384-Mui3y5TB8qajL5M6PY4mE1uUYMn4t1FaPc43ezyMpWkg1xlXTFTybv/ras5DbyGY' },
      'barlow': { normal: 'sha384-xXCnpb0VD3Ch8liAUHOCsyXfe1OXkjxniUbQi44REHqCt1LkI8/z6r1wTf9W01fg', bold: 'sha384-bdU+bVk8esgoMNW37P2SDrzYs3qiJtgyZUM+CZtQXWj40IDT51rOi5STysKpJHb8', italics: 'sha384-s3xuOUmmrHvQ1OZk2Z2JS2rsa/RK4BqGE4JGfjmudxVcf/PaBs1gpt7CHYFLdlli', bolditalics: 'sha384-ItLcnBL6TgpOr6MgspFRoA12Uyxx5drqU8A6YD9Ru1OE40oGlAd7jYciiqUiLONF' },
      'roboto-condensed': { normal: 'sha384-6pecCOCMWNf/ay7KIRzGOoTpa2X2OySjCZAmbGsyLkSb9gF0KuQE3llpXULIstH1', bold: 'sha384-VHzZV5GeCoxcrGZSoqx9h4xIXBxA83eM91LKpnXLu+CBevHWmDMzLk6kNOq/UHR3', italics: 'sha384-cEIEEwxQmMUi7903cWLMewePlfyRzsQvz2jxXWmYG3MFrpsrkl3avQN55zAAtgVT', bolditalics: 'sha384-T6rw5itpwlLHeKm2R/I7DWN1Hm1Lz2E3TKIMetThcgEwDSg5pLP3dJPC19QZOowo' },
      'titillium-web': { normal: 'sha384-szEfnyD7DUghrHlP5rQyUOPbXXg838+4135R6JYqIj9bRK+jN23gYMc1W0YXmKZi', bold: 'sha384-vNthljKVUoJJgaH41rg3hOACRdJ8HedU8jI6y2sIotqeaEZBV1/wMJ21LIYYsiod', italics: 'sha384-6saBv/Hs6yL5/QzGUXtqmHP4j6p5ckpIq3HXOh2Iaf7xM7QzO5H7Z7eRMyuzW/UD', bolditalics: 'sha384-TRGZDhqAg60TCnTdRCGvQzf2xp3Bkm1+HoDDECB+5aCHFY5ANyAmKx96Ctu/ObCK' },
      'josefin-sans': { normal: 'sha384-M7GCcLTXGPB4vqCd7MQGusJ8EO79Y7QasJjE3RFvTnUKXmcW8C7f/UE51qa6mCn5', bold: 'sha384-V1efrpGNZwICVEHt91mjSCmjVLVk65q1JUvfKlbKA0fKujFAOUotyoFt+/3T075i', italics: 'sha384-YfWlST2yF+vvzPjUFkzjKhqLJs09IWr82SZHZmkfFqtWX8Lqm6N9kBs+eVgoekyq', bolditalics: 'sha384-m6Bqw8Kc28nuYKvYpwV1NlC2+dsTJcabcPzlWTQqHO97KMdoctaTGmez8H4f+9/A' },
      'comic-neue': { normal: 'sha384-93S60AW7UZhzZxDBUR1RyAq8mwFHs3VmJiLcITu7JYsKv+HkPuy1+SvjPH2NCAyL', bold: 'sha384-bpu47WwiCNJIngpdgCruCbEeuteI68jUszdw1GyqnVbBUuQNdFPmc0bF0mDhedFh', italics: 'sha384-jTpwDqUK485CyJe94a2lbLrkgtGefl0c1jkHSEYpr2Ve6Gy5m644IzrVbVHqWBB6', bolditalics: 'sha384-CNbUCs+CVV3oZ4JOAnQjc7GliMBpC0qPuzigTg4C5aPwbKCxMbl8SDS8UyHvErhE' },
      'roboto-slab': { normal: 'sha384-E9+BhR/7WwHsvcLEdvFZqHFi9I+6hRVPTh2GJ97z3wyvB22NY+jHi2gy+aV153h/', bold: 'sha384-jLPaWD3mUeKLxIkYyc6bBOmEi4Vzdo1H5zZqYaxlCSGPGk4DMwhyf6Z3CTWL2XL6' },
      'merriweather': { normal: 'sha384-TtVr/36K1kWLWV9fOauxFU/vJZFe+A22h/kXEGy+mZtWuSbht8QYexXRlHBgYH4M', bold: 'sha384-1KcI74t1tmBu8NhDXYFiBfYwAr4kQcKK4PiuwXDFS+uh+F0crzn29pildt9spfTh', italics: 'sha384-HC65Ayr64zx/yGyufGylgFgT99aJ61JajCbsXCe2wctkOsfw66Lcz4pyD5e91H/S', bolditalics: 'sha384-SZgFG3Dhu9brB9szrplb6ECeP+ow/LUu61CfF6os6eFFwbjslqeygDnshtEz/Jlx' },
      'lora': { normal: 'sha384-ZeATdvhXnfG16ihfelHbbRZvWKlrOZYOdwLh7C2SVaCcd0Tr9MTYgG5Sjixi+jJt', bold: 'sha384-6OiznxjRYMPMlU9fdb/wJR+aPURNY66knA4aus7I7naV5bvM3Yf23eqdX9QlsjJv', italics: 'sha384-GglcWwLTdCy2e6+ut35gUE9/igSQH4Po0+HOwD4oBmNdz0y9jQwwOpzKEIGBnXnQ', bolditalics: 'sha384-UtRpHAr9lX2tz4HLTjQK8I9khPP54uZ9fYQCDkiD3A5XYVroSr5BCc0cCeobubNl' },
      'playfair-display': { normal: 'sha384-EkGu7W9U+uFe+HHRy8O7CBRT5A42C0qP9cYOKEW5nAdf+7EksctLVEvvZr2mQlrl', bold: 'sha384-nucFrFWuOnkw3d02+GUixbUysc+IKTBBXlzZikJi4eLRv4KLzyWcxvJ7szmTQ2oz', italics: 'sha384-/tSHDGJidfh4L4fosITxi4OOc9WMdaSFo3HVjmrOKYdszJwhCgpRigDKiNGq1ocS', bolditalics: 'sha384-jBWYgiXWgVSqolqAsBbQ/SZuCo4hCRofjRyaOzHQvglsZXAYR2qA0kcXfg7nYkiS' },
      'pt-serif': { normal: 'sha384-DQesT/kT4A5tZuU35NGPRTgyQQzUpFbAD3jrDd4EMFcSMR+xmXx5jKL7Jg7PfGzc', bold: 'sha384-8L87jG4gOeguCqVnbf6Rl1AIA+f2eXQqG1oRnb25w+twVHrLfYSKZ5XjfOC3Jyzn', italics: 'sha384-JVgH1lBFjAxoThoRwSEZ2GV1uttXyUDc0HkhhUBRVEF5ZXnlVv47BG3iUcCiPc17', bolditalics: 'sha384-vpMCxTWnWywJsvBCRVoA9y6fsTHt/8b5HLpsmlAQC+Yge1URJUi9BpFkPUk0AlSj' },
      'source-serif-4': { normal: 'sha384-MaF2IJbvKMZEpIk/WfMyIwKSqGhUD+mF/CvDTRhSpx8hdPP/4+EAks7GlsaxcJgP', bold: 'sha384-AREKTUqlS0BkPBnnLMI6wzmR9CUva+MAiQcOjAEb6BC6KcRWMQen+ml0b3jrNsOs', italics: 'sha384-XUUAJPyTchCNKw0gKXkepH06cQ1oNtlfxqH1aH30dTRrzeuluFSqLenG81U/SEYv', bolditalics: 'sha384-gj4E4Wt7REJxai7hUjPcDYYENwUon3XnV9HQuiLWK4dNUKzWmQRs4Xtqb0aO+A8H' },
      'noto-serif': { normal: 'sha384-q4PmNFsJFOPwyDgi8SIcT6p/e2ocZodAjnLFsfSM3ERdcLPQCn2Bml2Z3jY8HTQJ', bold: 'sha384-RJzORazeSvFKHs8UVtJZrbr5EEV1hnUQrIWl//lyr/0RE77BrRIfiz3DbEixcCCQ', italics: 'sha384-k3EpR/YlTRqUjYGu1dx4fc+e+gNDLsgW0xZzDq4YC4k8REgu9CnlnT+i5xZnbCKQ', bolditalics: 'sha384-GtQu7b1UKoTGmpSo/torQSwsOcm8iGQyJczMhNHrJkFeCmPTitmDliEnwkKcXnbp' },
      'libre-baskerville': { normal: 'sha384-yavFHLABx/9t8PlRF2km2EwH/uFfI07Q4Xsa+lB+uAaLv0yFhko7tujEOVwRP6YA', bold: 'sha384-IpRz55EOVOj6I6cyGjfS3fPuvUz6aV5uV7RBJZWLtZSn2QSJu99Zi6IM3ogFa1Tl', italics: 'sha384-f1dftkYdnTkySKAYXsDaI6AzfSDXEJd7Pszkm0rDB4owW5w7ZKwHMP1DAwsKMdgH', bolditalics: 'sha384-oGzQ0Q87SYNXQoI4oMaYCZll5NC8FaaCTiGjHzzP+8ElLPukjHmqwx8j6XLn7Vs2' },
      'crimson-text': { normal: 'sha384-qbMyTk3SmfBmA3rwloz1QeQhbm12tkWDdQAo5Cs91iduLteOJHeRX14M8ivm2i7t', bold: 'sha384-0vaXar7avZVPXAxTLD4facO9V6mIqziprFn5eZ0NC/+6Rc0N9WC2ZT8HS+tji8xM', italics: 'sha384-dbZGreANdN1GTYLbFsaQCPFg1a7TjocoUp9yhHJ44McuPPNzNu5igascoNyzzBH1', bolditalics: 'sha384-n4gbTnHRFDtuQV2fraMWQUDBLSIn3pjJjLYTy1Ien7S71F169NtFB0oywRfuHmbb' },
      'eb-garamond': { normal: 'sha384-mx8MUx+tzRjJ4R6q8pY+NT6d7wH6XTiqiwmpMJYF1hetyNdQAeUsXk9LSRxDhXG8', bold: 'sha384-+yf3mNWR/R7PVUJ6Mu4G72+lL5Ji9blQ5XvN3ic4RwlaRPwVC0ifnu4TQelteawN', italics: 'sha384-QEULsw7W1/b+S7bLtihKvjdRlEYMT49gvm50qHcd39qCtrQnDSu4iRedQNfkIXtw', bolditalics: 'sha384-zIOTSwvzAqccrcBEwIx2iCav5KPl8Egb63dWW+Cdvqw14AoCcURtz+t9bzHG4TF+' },
      'cormorant-garamond': { normal: 'sha384-vxDB5scNrn/VC859BGU3hHf/Y3fB355QQGhshqgHM+/YO3sUGG+uEbnQIBAXvqzP', bold: 'sha384-VGTiiZu/j21vrfz/SEFkJA9fl4Vv2NT8Z+gzqrSWlJExB4iJ/PIsNOuKQVT6aP4B', italics: 'sha384-hHgf99u9wvjLGGoffQaYT1E6NCH9oKFN3bU4TnI5XdmZikQTyJZRPPZmGgS4M1V4', bolditalics: 'sha384-r6QewQACmv/HyzRCrWWUAgnKaAd0rqMaxSHQp9p5647Up+Iy/YNIlgZteEBVBjc1' },
      'caladea': { normal: 'sha384-uLVa1d9PFUxRnPLmDwD1M0pILTkeIJirRfbgBv8xx10ybu3TCU2Bd/Seez94MXJt', bold: 'sha384-6A1MQFF1YHvjgibWAfdwBT6am1Z6XuAdgDAQdpF9ZrrL+YqzQNcfJgW6CRzjdDyb', italics: 'sha384-6djuN/m2pmYKdmPaxKZdxT979hfM2WV1jz2IhEFWjSjpj4qQI+oASFVgvXxiN29g', bolditalics: 'sha384-nY+lqZL77evDu+gT9zzXpCA5mvS2JpyFoyhldXyKeBuy3aNhIWVtrJZL34dCT0k1' },
      'ibm-plex-serif': { normal: 'sha384-g71IdmwMDQR9EqG0oS46oQFGWiM0VIYMGVGShJ83CvbVHOB1858WtaC+v1w/N85T', bold: 'sha384-cmmXzGMo0lo+ha8Cz083N6FhOymTdoLLQZPWaEaACRL8a7K8L0Cut47OCG5bwu8i', italics: 'sha384-CUeXUHBk8t1f25hMmlMzABvu9p/0qLO9/vtB/ieohE3QATyvN56VX++sebiC0AYj', bolditalics: 'sha384-/CR144vXqhwJT1n0HemlFl4wefsmBhigKLGKyiMxMYRYNOtz7vC9MLs/X65948HZ' },
      'roboto-mono': { normal: 'sha384-ZxDvQOW8eI/7l7SZAmY1+QvQAwKZaSmrjgssJt7Q4ZRnoZ58SPGcnugtXgjQ++FV', bold: 'sha384-vr4YgqabM37ntCCcloYiyVFBe0/ut+R4NS7YJsLH/9kwzSH1ea7s6OAP1ClpoXCV', italics: 'sha384-gseopSpWhTlWYLRxNPbXhTkwsmFGyVH6O//gECk9bhS4LLq0WiEePWrgQ81QvRTa', bolditalics: 'sha384-PoQIG68ds40xLG0F5RPm4DLyy+wGPQEQel2bTc6JAfvLBsTKVuLTeTy6dsmUFXIF' },
      'fira-code': { normal: 'sha384-OcWjBYffcRW6dOTSknyMw9SNxjyJcp6HdlSRlC8LEXi3Q0AVfxi+JwmKas/QAfpA', bold: 'sha384-YRc/fexI1nDD1CsDMbkJkdSF0P5pJbP2cQJQtYqrjJ4IeSFtqxrKtV53jD9K3wxI' },
      'source-code-pro': { normal: 'sha384-79M57FuT0j3DFewh/ZCJYKUukSDxu3ITIWgp1HgH7j5sROEs++3L71zdnm6xFbi1', bold: 'sha384-mSsWtkQ5ZbTBOzVif1ZuBtj9jvGqURs40UJAPa/DavNsKKpxgLNZ7yONOiWmv/py', italics: 'sha384-A8baFtPupJZVjte01gvjyjmEEChLyehUPqZTOc3HTQgLM+sP3nPcXOt4OzO3wI3P', bolditalics: 'sha384-RBoOnHPtFg9PTWyDGv0CDepJcDkf8NBmEbAhQkNQG5/p6kun9w6sqXfvn8HNHn4o' },
      'jetbrains-mono': { normal: 'sha384-1CUFiITvZLNauEQJOeFBLZzcxV2YLQP/Hc/2n36BQE6G59ubCzUM3hKEHrhVBn15', bold: 'sha384-hCaRk6EnQd4DdFVvzia6uKP6/hnH91eIBjvx7Cke/jRee/U3h1+twY4NZYdTGi0b', italics: 'sha384-hnQjvI5kobtfgCft/YU/MPv1P3t6hx2SPkWJsf2rqrjsqazxzLnne5WkmpOon6Dq', bolditalics: 'sha384-7ufmz+2THx98JGHFx6fnNuNjSCf667QVxDZStLQQdqZd/0FedMSeNH9zUP1x1GdO' },
      'ibm-plex-mono': { normal: 'sha384-U1Cp2qUnKYOEexRLI4R73ygeVju/AJctf5ynNwc83R+vFgBb92IUDOT+ywq/+uUf', bold: 'sha384-MmgBKT6feMzMFuLz6Nsnh1tutG7+FXxLKKXPuVBVokxt58+SS4nLvbKOfXCHJUgG', italics: 'sha384-3jDxyDJd5i0UfoEySFP+cc1bnvBpAH5ZDCx2F4VDxM6CQTUYQe6KlREoMC2WmAd3', bolditalics: 'sha384-9DfDf3BRzF4yqfjmBGuE0caAjGlGNy6ejuFODk6ZYdG9uWDArg3SnA5b6tlggUtO' },
      'inconsolata': { normal: 'sha384-qpI/kwEfLUB81o4ona8Ic66g09Ggf0mX+b5I8eS7hNl1tDuyq7b49Id/dgeVl8+K', bold: 'sha384-Q1YBI0ch9FVAl6fa/Uciy+Cr9g63wjNKAA9+1jjs1vsvrfwh956LNEJl2KUdDX1f' },
      'atkinson-hyperlegible': { normal: 'sha384-d82v3CO0iYw9HrAAGhnjhNpTraJzcAOaX528zx9uuAYbmPNagi6OGlB5eAr7Y3kL', bold: 'sha384-vbWm8A49x/+7WC2O9jr19/cY4lirJQ+BjR+sWSwKYmXlUdcKbGXH/mDZJfXNk1lz', italics: 'sha384-vFRt/kLhGzfBCg49rVIHxWg3O9w1AJSbF7jVOv0AgFWY5auSdy+k7TK7sKTzc4Y9', bolditalics: 'sha384-TpZLNLetHFo6jIJlQ0NHCOJDhNiJnug+Fx9+exTtZM6hHrtt1A4L5smGtnhNn1K0' },
      'lexend': { normal: 'sha384-gUELT+EboNfRirY+B85vkLwC6zhWcZY1B+AQVxbKncbUVZjrDifG9RFfvYwC8zVW', bold: 'sha384-fj4sY/3yS9v4AWuo8z8KJCbfvHPBhX5i92edtRp4NPktNd3rz4CyqvoqnuAGi78s' },
      'opendyslexic': { normal: 'sha384-StUjwuPTvaCExB2a+P83ANjr0gW4omQLj9UZR6jSy+0Tr99jK/YymXDXCPD5Pj0n', bold: 'sha384-WQeW79PMPqygI3TsYnn/VckqFzaH58OmI3hEks3vaoC+/TIajX/3SXwtLyiQDP6S', italics: 'sha384-GFWIDeZACVjUcXGsIEOaJoG6kZFeGEYYxd4fdofU4TKT0tDATXfKAacWJpKQKOn4', bolditalics: 'sha384-xmAaTQzY/E6GYLGTFcI+vV5jxN9RrpFxXt+kTKWMyNgqCdomef++tUcCmxNCBHXs' },
    };
    // </generated:hashes>
  const loaded = new Set();
  const loading = new Map();

  const urlOf = (font, style) => BASE + font.slug + '@' + font.version + '/files/' + font.slug + '-latin-' + STYLES[style][0] + '.woff';
  const has = (font, style) => font.styles.includes(STYLES[style][1]);
  const localName = (font, style) => 'PPLibre-' + font.slug + '-' + style + '.ttf';

  async function loadOne(pdfMake, font, fetcher, hashes) {
    const table = (hashes && hashes[font.slug]) || HASHES[font.slug];
    if (!table) return { ok: false, reason: 'integrity', font: font.name };
    const styles = Object.keys(STYLES).filter(style => has(font, style));
    const results = await Promise.all(styles.map(style => PolicesWoff.fetchVerified(urlOf(font, style), table[style], fetcher)));
    const bad = results.find(result => !result.ok);
    if (bad) return { ok: false, reason: bad.reason, font: font.name };
    const files = {};
    styles.forEach((style, i) => { files[style] = localName(font, style); pdfMake.vfs[files[style]] = results[i].base64; });
    const family = {};
    Object.keys(STYLES).forEach((style) => {
      family[style] = files[style] || (FALLBACK[style] || []).map(other => files[other]).find(Boolean);
    });
    if (!pdfMake.fonts) pdfMake.fonts = {};
    pdfMake.fonts[font.name] = family;
    loaded.add(font.slug);
    return { ok: true };
  }

  function load(pdfMake, fonts, options) {
    if (!pdfMake || !pdfMake.vfs) return Promise.resolve({ ok: false, reason: 'engine' });
    const { fetcher, hashes } = options || {};
    const get = fetcher || ((url, init) => fetch(url, init));
    return (async () => {
      for (const font of fonts) {
        if (loaded.has(font.slug)) continue;
        if (!loading.has(font.slug)) loading.set(font.slug, loadOne(pdfMake, font, get, hashes).then((result) => { loading.delete(font.slug); return result; }, (e) => { loading.delete(font.slug); throw e; }));
        const result = await loading.get(font.slug);
        if (!result.ok) return result;
      }
      return { ok: true };
    })();
  }

  // `forget` ne sert qu'aux essais : repartir d'une session où rien n'a été chargé.
  return { BASE, HASHES, STYLES, load, isLoaded: slug => loaded.has(slug), forget() { loaded.clear(); loading.clear(); } };
})();
