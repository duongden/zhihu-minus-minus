package com.zhihuminus.richtext

import android.graphics.Color
import org.json.JSONArray
import org.json.JSONObject

internal data class TextRange(val start: Int, val end: Int) {
  fun intersects(startOffset: Int, endOffset: Int) = start < endOffset && end > startOffset
}

internal data class FlowData(
  val id: String,
  val textVersion: String,
  val text: String,
  val spans: List<JSONObject>,
  val paragraphs: List<JSONObject>,
  val decorations: List<JSONObject>,
  val attachments: List<JSONObject>
) {
  companion object {
    fun parse(value: String): FlowData? = runCatching {
      val json = JSONObject(value)
      FlowData(
        json.getString("id"), json.getString("textVersion"), json.getString("text"),
        json.optJSONArray("spans").objects(), json.optJSONArray("paragraphs").objects(),
        json.optJSONArray("decorations").objects(), json.optJSONArray("attachments").objects()
      )
    }.getOrNull()
  }
}

internal data class TextConfig(
  val fontSize: Float = 17f,
  val lineHeight: Float = 28f,
  val paragraphSpacing: Float = 12f,
  val textColor: Int = Color.rgb(35, 39, 43),
  val secondaryColor: Int = Color.rgb(112, 117, 123),
  val linkColor: Int = Color.rgb(23, 91, 199),
  val justify: Boolean = false,
  val textAlign: String = "left"
) {
  companion object {
    fun parse(value: String): TextConfig = runCatching {
      val json = JSONObject(value)
      TextConfig(
        json.optDouble("fontSize", 17.0).toFloat().coerceIn(8f, 64f),
        json.optDouble("lineHeight", 28.0).toFloat().coerceIn(8f, 120f),
        json.optDouble("paragraphSpacing", 12.0).toFloat().coerceIn(0f, 120f),
        parseColor(json.optString("textColor"), Color.rgb(35, 39, 43)),
        parseColor(json.optString("secondaryColor"), Color.rgb(112, 117, 123)),
        parseColor(json.optString("linkColor"), Color.rgb(23, 91, 199)),
        json.optBoolean("justify", false),
        json.optString("textAlign", "left").takeIf { it == "center" || it == "right" } ?: "left"
      )
    }.getOrDefault(TextConfig())
  }
}

internal fun JSONObject.range(textLength: Int): TextRange? {
  val start = optInt("start", -1)
  val end = optInt("end", -1)
  return if (start >= 0 && end > start && end <= textLength) TextRange(start, end) else null
}

internal fun JSONArray?.objects(): List<JSONObject> =
  if (this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it) }

internal fun parseColor(value: String?, fallback: Int): Int =
  if (value.isNullOrBlank()) fallback else runCatching { Color.parseColor(value) }.getOrDefault(fallback)
