import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractRichTextText,
  getRichTextPreviewText,
  hasMeaningfulRichText,
  normalizeRichTextForEditor,
  sanitizeRichTextHtml,
} from "./rich-text";

// Санитайзер — барьер XSS: его результат вставляется в DOM через
// dangerouslySetInnerHTML (MaterialView для материала курса, предпросмотр
// email-шаблонов в админке). Тесты фиксируют и защиту, и разрешённое
// форматирование, чтобы правки санитайзера не делались вслепую.

// ---------------------------------------------------------------- безопасность

test("вырезает script вместе с содержимым", () => {
  assert.equal(sanitizeRichTextHtml("<script>alert(1)</script><p>ок</p>"), "<p>ок</p>");
});

test("вырезает script в верхнем регистре", () => {
  assert.equal(sanitizeRichTextHtml("<SCRIPT>alert(1)</SCRIPT><p>ок</p>"), "<p>ок</p>");
});

test("вырезает самозакрытый script с атрибутами", () => {
  assert.equal(sanitizeRichTextHtml('<script src="//зло.test/x.js"/><p>ок</p>'), "<p>ок</p>");
});

test("вырезает style, iframe, object, embed, svg и math с содержимым", () => {
  for (const tag of ["style", "iframe", "object", "embed", "svg", "math"]) {
    assert.equal(
      sanitizeRichTextHtml(`<${tag}>полезная нагрузка</${tag}><p>ок</p>`),
      "<p>ок</p>",
      `не вырезан <${tag}>`
    );
  }
});

test("отбрасывает обработчики событий у разрешённых тегов", () => {
  assert.equal(sanitizeRichTextHtml('<p onclick="alert(1)">текст</p>'), "<p>текст</p>");
  assert.equal(sanitizeRichTextHtml('<b onmouseover="alert(1)">текст</b>'), "<b>текст</b>");
});

test("отбрасывает произвольные атрибуты, включая style и class", () => {
  assert.equal(
    sanitizeRichTextHtml('<p class="hack" style="position:fixed;inset:0">текст</p>'),
    "<p>текст</p>"
  );
});

test("удаляет HTML-комментарии", () => {
  assert.equal(sanitizeRichTextHtml("<!-- секрет --><p>ок</p>"), "<p>ок</p>");
});

test("удаляет неизвестные теги, сохраняя их текст", () => {
  assert.equal(sanitizeRichTextHtml("<marquee>бегущая строка</marquee>"), "бегущая строка");
  assert.equal(sanitizeRichTextHtml("<form><input></form><p>ок</p>"), "<p>ок</p>");
});

// ------------------------------------------- обходы, проверенные атакой (регрессия)
// Ниже — payload-ы из адверсариального разбора санитайзера. Все обезврежены;
// тесты держат это свойство при будущих правках.

test("склейка тега после вырезания опасного не оживляет script", () => {
  assert.equal(sanitizeRichTextHtml("<scr<script>ipt>alert(1)</script>"), null);
  assert.equal(sanitizeRichTextHtml("<scr<!---->ipt>alert(1)</script>"), null);
});

test("вторая линия защиты ловит тег, пересобранный вырезанием", () => {
  // <sv<svg>g ...> после удаления внутреннего <svg> склеивается в <svg onload=...>,
  // и его снимает уже перезапись по whitelist.
  assert.equal(sanitizeRichTextHtml("<sv<svg>g onload=alert(1)>"), null);
});

test("самозакрытый svg с обработчиком удаляется", () => {
  assert.equal(sanitizeRichTextHtml("<svg/onload=alert(1)>"), null);
});

test("незакрытый тег в конце не утекает в вывод", () => {
  // Обрывок инертен как весь innerHTML, но результат санитайзера склеивается
  // в письмо (<td>${content}</td>), где '>' пришёл бы из соседней разметки.
  assert.equal(sanitizeRichTextHtml("<p>ок</p><img src=https://a.test onerror=alert(1)"), "<p>ок</p>");
  assert.equal(sanitizeRichTextHtml("<p>ок</p><a href=/x"), "<p>ок</p>");
});

test("ввод вообще без '>' уходит в текстовую ветку и экранируется", () => {
  assert.equal(
    sanitizeRichTextHtml('<img src=https://a.test onerror=alert(1) x="'),
    '<p>&lt;img src=https://a.test onerror=alert(1) x=&quot;</p>'
  );
});

test("тег-псевдоним image не проходит whitelist", () => {
  assert.equal(sanitizeRichTextHtml("<image src=/x onerror=alert(1)>"), null);
});

test("'>' в атрибуте разрешённого тега не открывает дорогу обработчику", () => {
  const result = sanitizeRichTextHtml('<b x=">"><img src=https://a.test onerror=alert(1)>');
  assert.ok(!/onerror/i.test(result ?? ""), "onerror пережил разбор");
  assert.ok(result?.includes('<img src="https://a.test" alt="" data-width="100">'));
});

test("подставной href внутри чужого атрибута отбрасывает ссылку целиком", () => {
  // readHtmlAttribute находит ПЕРВОЕ вхождение ' href=' — внутри значения x.
  // Санитайзер закрывается (fail-closed), а не берёт «настоящий» href.
  assert.equal(
    sanitizeRichTextHtml('<a x=" href=javascript:alert(1) " href="/safe">клик</a>'),
    "<a>клик</a>"
  );
});

test("двойное кодирование не оживляет разметку", () => {
  assert.equal(
    sanitizeRichTextHtml("&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;"),
    "<p>&amp;amp;lt;script&amp;amp;gt;alert(1)&amp;amp;lt;/script&amp;amp;gt;</p>"
  );
});

// ------------------------------------------------------------------ схемы URL

test("ссылка с javascript: теряет href", () => {
  assert.equal(sanitizeRichTextHtml('<a href="javascript:alert(1)">клик</a>'), "<a>клик</a>");
});

test("ссылка с data: и vbscript: теряет href", () => {
  assert.equal(
    sanitizeRichTextHtml('<a href="data:text/html;base64,PHNjcmlwdD4=">клик</a>'),
    "<a>клик</a>"
  );
  assert.equal(sanitizeRichTextHtml('<a href="vbscript:msgbox(1)">клик</a>'), "<a>клик</a>");
});

test("символ > внутри значения атрибута обрывает разбор, но href не проходит", () => {
  // Регулярка разбора тега останавливается на первом '>', поэтому «хвост»
  // значения попадает в вывод как ТЕКСТ (косметический дефект, не исполняется).
  // Главное: опасная схема не переживает разбор.
  const result = sanitizeRichTextHtml('<a href="data:text/html,<b>x">клик</a>');
  assert.equal(result, '<a>x">клик</a>');
  assert.ok(!/href=/i.test(result ?? ""), "href не должен пережить разбор");
});

test("картинка с небезопасным src удаляется целиком", () => {
  assert.equal(sanitizeRichTextHtml('<img src="javascript:alert(1)">'), null);
  assert.equal(sanitizeRichTextHtml('<img src="data:text/html,<script>alert(1)</script>">'), null);
});

test("разрешённые схемы ссылок сохраняются и получают безопасный rel", () => {
  assert.equal(
    sanitizeRichTextHtml('<a href="https://ок.test/док">док</a>'),
    '<a href="https://ок.test/док" target="_blank" rel="noreferrer">док</a>'
  );
  for (const href of ["http://ок.test", "/курсы/1", "#якорь", "mailto:hr@lms.local", "tel:+70000000000"]) {
    const result = sanitizeRichTextHtml(`<a href="${href}">ссылка</a>`);
    assert.ok(result?.includes(`href="${href}"`), `отброшена валидная схема: ${href}`);
  }
});

test("одинарная кавычка в href не разрывает атрибут", () => {
  // escapeAttribute не экранирует ', но значение обёрнуто в двойные кавычки —
  // вырваться из атрибута нельзя.
  const result = sanitizeRichTextHtml("<a href=\"https://ок.test/'onmouseover='alert(1)\">клик</a>");
  assert.ok(result?.startsWith('<a href="https://ок.test/'));
  assert.ok(!/onmouseover=/i.test(result?.replace(/href="[^"]*"/, "") ?? ""));
});

test("кавычка и угловая скобка в href экранируются", () => {
  const result = sanitizeRichTextHtml('<a href=\'https://ок.test/?a="b"&c=<d\'>клик</a>');
  assert.ok(result?.includes("&quot;"));
  assert.ok(result?.includes("&lt;"));
  assert.ok(result?.includes("&amp;"));
});

// -------------------------------------------------------- разрешённое форматирование

test("сохраняет базовое форматирование", () => {
  assert.equal(
    sanitizeRichTextHtml("<p>Как <strong>важно</strong> и <em>кстати</em></p>"),
    "<p>Как <strong>важно</strong> и <em>кстати</em></p>"
  );
  assert.equal(sanitizeRichTextHtml("<h2>Раздел</h2><h3>Пункт</h3>"), "<h2>Раздел</h2><h3>Пункт</h3>");
  assert.equal(sanitizeRichTextHtml("<ul><li>раз</li><li>два</li></ul>"), "<ul><li>раз</li><li>два</li></ul>");
  assert.equal(sanitizeRichTextHtml("<blockquote>цитата</blockquote>"), "<blockquote>цитата</blockquote>");
});

test("нормализует блочные контейнеры в абзацы", () => {
  assert.equal(sanitizeRichTextHtml("<div>текст</div>"), "<p>текст</p>");
  assert.equal(sanitizeRichTextHtml('<section class="x">текст</section>'), "<p>текст</p>");
  assert.equal(sanitizeRichTextHtml("<article>текст</article>"), "<p>текст</p>");
});

test("br нормализуется, закрывающий br отбрасывается", () => {
  assert.equal(sanitizeRichTextHtml("<p>строка<br/>вторая</p>"), "<p>строка<br>вторая</p>");
  assert.equal(sanitizeRichTextHtml("<p>строка</br>вторая</p>"), "<p>строкавторая</p>");
});

// ------------------------------------------------------------------ картинки

test("картинка сохраняет только src, alt и ширину", () => {
  assert.equal(
    sanitizeRichTextHtml('<img src="https://ок.test/с.png" alt="Схема" data-width="50" onerror="alert(1)">'),
    '<img src="https://ок.test/с.png" alt="Схема" data-width="50">'
  );
});

test("ширина картинки ограничена диапазоном 25–100", () => {
  const width = (raw: string) => sanitizeRichTextHtml(`<img src="/с.png" data-width="${raw}">`);
  assert.ok(width("50")?.includes('data-width="50"'));
  assert.ok(width("25")?.includes('data-width="25"'));
  assert.ok(width("100")?.includes('data-width="100"'));
  assert.ok(width("10")?.includes('data-width="100"'), "значение ниже минимума не приведено к 100");
  assert.ok(width("500")?.includes('data-width="100"'), "значение выше максимума не приведено к 100");
  assert.ok(width("abc")?.includes('data-width="100"'), "нечисловое значение не приведено к 100");
  assert.ok(width("50.5")?.includes('data-width="100"'), "дробное значение не приведено к 100");
});

test("ширина берётся из width, если нет data-width", () => {
  assert.ok(sanitizeRichTextHtml('<img src="/с.png" width="40">')?.includes('data-width="40"'));
});

test("документ из одной картинки не считается пустым", () => {
  assert.equal(
    sanitizeRichTextHtml('<img src="/с.png">'),
    '<img src="/с.png" alt="" data-width="100">'
  );
});

// -------------------------------------------------------------------- figure

test("figure сохраняет только валидные data-атрибуты", () => {
  assert.equal(
    sanitizeRichTextHtml('<figure data-kind="image" data-bg="#FF0000" data-pad="small">и</figure>'),
    '<figure data-kind="image" data-bg="#ff0000" data-pad="small">и</figure>'
  );
});

test("figure отбрасывает невалидные data-атрибуты", () => {
  assert.equal(sanitizeRichTextHtml('<figure data-bg="red" data-pad="huge">и</figure>'), "<figure>и</figure>");
  assert.equal(sanitizeRichTextHtml('<figure data-kind="script">и</figure>'), "<figure>и</figure>");
  assert.equal(
    sanitizeRichTextHtml('<figure data-bg="#fff\\" onload=\\"alert(1)">и</figure>'),
    "<figure>и</figure>"
  );
});

// ------------------------------------------------------------- обычный текст

test("текст без тегов разбивается на абзацы и экранируется", () => {
  assert.equal(sanitizeRichTextHtml("Первый\n\nВторой"), "<p>Первый</p><p>Второй</p>");
  assert.equal(sanitizeRichTextHtml("Строка\nПродолжение"), "<p>Строка<br>Продолжение</p>");
});

test("спецсимволы в тексте без тегов экранируются", () => {
  assert.equal(sanitizeRichTextHtml("5 < 10 & 7 > 3"), "<p>5 &lt; 10 &amp; 7 &gt; 3</p>");
});

// ----------------------------------------------------------- пустые значения

test("пустые значения дают null", () => {
  assert.equal(sanitizeRichTextHtml(null), null);
  assert.equal(sanitizeRichTextHtml(undefined), null);
  assert.equal(sanitizeRichTextHtml(""), null);
  assert.equal(sanitizeRichTextHtml("   \n  "), null);
});

test("разметка без текста и картинок даёт null", () => {
  assert.equal(sanitizeRichTextHtml("<p></p>"), null);
  assert.equal(sanitizeRichTextHtml("<p><br></p>"), null);
  assert.equal(sanitizeRichTextHtml("<script>alert(1)</script>"), null);
});

// -------------------------------------------------- извлечение текста и хелперы

test("extractRichTextText собирает читаемый текст", () => {
  assert.equal(extractRichTextText("<p>Привет <b>мир</b></p>"), "Привет мир");
  assert.equal(extractRichTextText("<ul><li>раз</li><li>два</li></ul>"), "- раз - два");
  assert.equal(extractRichTextText('<img src="/с.png" alt="Схема">'), "Схема");
  assert.equal(extractRichTextText(null), "");
});

test("extractRichTextText декодирует сущности", () => {
  assert.equal(extractRichTextText("<p>5 &lt; 10 &amp; 7</p>"), "5 < 10 & 7");
});

test("hasMeaningfulRichText отличает содержимое от пустой разметки", () => {
  assert.equal(hasMeaningfulRichText("<p>текст</p>"), true);
  assert.equal(hasMeaningfulRichText("<p></p>"), false);
  assert.equal(hasMeaningfulRichText(null), false);
});

test("normalizeRichTextForEditor всегда даёт разметку для редактора", () => {
  assert.equal(normalizeRichTextForEditor(null), "<p></p>");
  assert.equal(normalizeRichTextForEditor(""), "<p></p>");
  assert.equal(normalizeRichTextForEditor("<p>текст</p>"), "<p>текст</p>");
});

test("getRichTextPreviewText чистит и извлекает текст за один вызов", () => {
  assert.equal(getRichTextPreviewText('<p onclick="alert(1)">Привет <b>мир</b></p>'), "Привет мир");
  assert.equal(getRichTextPreviewText("<script>alert(1)</script>"), "");
});
