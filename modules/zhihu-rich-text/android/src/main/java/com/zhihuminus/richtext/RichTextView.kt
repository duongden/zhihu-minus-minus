package com.zhihuminus.richtext

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Typeface
import android.os.Build
import android.text.Layout
import android.text.Selection
import android.text.Spannable
import android.text.SpannableString
import android.text.Spanned
import android.text.style.BackgroundColorSpan
import android.text.style.ForegroundColorSpan
import android.text.style.LeadingMarginSpan
import android.text.style.RelativeSizeSpan
import android.text.style.StrikethroughSpan
import android.text.style.StyleSpan
import android.text.style.UnderlineSpan
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import org.json.JSONObject
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

data class SelectionEvent(
  @Field val flowId: String,
  @Field val textVersion: String,
  @Field val start: Int,
  @Field val end: Int
) : Record

data class HeightEvent(
  @Field val flowId: String,
  @Field val textVersion: String,
  @Field val layoutKey: String,
  @Field val height: Double
) : Record

data class ActionEvent(
  @Field val flowId: String,
  @Field val textVersion: String,
  @Field val kind: String,
  @Field val id: String,
  @Field val start: Int,
  @Field val end: Int,
  @Field val url: String? = null
) : Record

private data class AttachmentUpdate(
  val generation: Int,
  val span: InlineAttachmentSpan,
  val asset: AttachmentAsset
)

/** One flow is one TextView, including all paragraph and attachment ranges. */
@SuppressLint("ViewConstructor")
class RichTextView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  override val shouldUseAndroidLayout = true
  private val onSelectionChange by EventDispatcher<SelectionEvent>()
  private val onHeightChange by EventDispatcher<HeightEvent>()
  private val onAction by EventDispatcher<ActionEvent>()
  private val textView = FlowTextView(context)
  private val density = resources.displayMetrics.density
  private val requests = mutableListOf<AttachmentSubscription>()
  private val attachmentUpdates = mutableListOf<AttachmentUpdate>()
  private var attachmentFrameScheduled = false
  private val attachmentFrame = Runnable { applyAttachmentUpdates() }
  private var flow: FlowData? = null
  private var config = TextConfig()
  private var previousFlowJson = ""
  private var previousConfigJson = ""
  private var layoutKey = ""
  private var contentWidthPx = 0
  private var generation = 0
  private var disposed = false
  private var suppressSelection = false
  private var lastHeightKey = ""
  private var lastSelectionKey = ""
  private var measuredTextHeight = 0
  private val fontScale: Float get() = resources.configuration.fontScale
  private val textScale: Float get() = density * fontScale

  init {
    orientation = VERTICAL
    clipChildren = false
    clipToPadding = false
    addView(textView, LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    textView.selectionListener = { start, end -> emitSelection(start, end) }
    textView.actionListener = { item, kind -> emitAction(item, kind) }
    textView.copyResolver = { start, end -> copyText(start, end) }
  }

  fun setFlowJson(value: String) {
    if (previousFlowJson == value) return
    previousFlowJson = value
    flow = FlowData.parse(value)
    lastHeightKey = ""
    lastSelectionKey = ""
    rebuild()
  }

  fun setConfigJson(value: String) {
    if (previousConfigJson == value) return
    previousConfigJson = value
    config = TextConfig.parse(value)
    rebuild()
  }

  fun setContentWidth(value: Float) {
    val pixels = ceil(value.coerceAtLeast(0f) * density).toInt()
    if (contentWidthPx == pixels) return
    contentWidthPx = pixels
    rebuild()
  }

  fun setLayoutKey(value: String) {
    if (layoutKey == value) return
    layoutKey = value
    lastHeightKey = ""
    requestLayout()
    post { if (!disposed && layoutKey == value) measureText() }
  }

  fun setSelectable(value: Boolean) {
    if (textView.isTextSelectable == value) return
    textView.setTextIsSelectable(value)
    textView.isClickable = true
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    super.onMeasure(widthMeasureSpec, heightMeasureSpec)
    measureText()
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    super.onLayout(changed, left, top, right, bottom)
    val desiredWidth = if (contentWidthPx > 0) contentWidthPx else max(1, right - left)
    textView.layout(0, 0, desiredWidth, measuredTextHeight)
  }

  fun dispose() {
    disposed = true
    generation += 1
    requests.forEach { it.cancel() }
    requests.clear()
    textView.selectionListener = null
    textView.actionListener = null
    textView.copyResolver = null
    removeCallbacks(attachmentFrame)
    attachmentFrameScheduled = false
    attachmentUpdates.clear()
  }

  private fun rebuild() {
    if (disposed) return
    generation += 1
    lastHeightKey = ""
    val currentGeneration = generation
    requests.forEach { it.cancel() }
    requests.clear()
    removeCallbacks(attachmentFrame)
    attachmentFrameScheduled = false
    attachmentUpdates.clear()
    val activeFlow = flow
    val oldFlow = textView.flow
    val selectedStart = textView.selectionStart
    val selectedEnd = textView.selectionEnd
    suppressSelection = true
    textView.flow = activeFlow
    textView.config = config
    textView.scale = textScale
    textView.setTextSize(TypedValue.COMPLEX_UNIT_PX, config.fontSize * textScale)
    textView.setTextColor(config.textColor)
    textView.gravity = Gravity.TOP or when (config.textAlign) {
      "center" -> Gravity.CENTER_HORIZONTAL
      "right" -> Gravity.RIGHT
      else -> Gravity.LEFT
    }
    textView.highlightColor = (config.linkColor and 0x00ffffff) or 0x44000000
    // Native line breaking supplies punctuation boundaries and Latin word wrapping.
    textView.breakStrategy = Layout.BREAK_STRATEGY_HIGH_QUALITY
    textView.hyphenationFrequency = Layout.HYPHENATION_FREQUENCY_NONE
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      textView.justificationMode = if (config.justify) Layout.JUSTIFICATION_MODE_INTER_WORD else Layout.JUSTIFICATION_MODE_NONE
    }
    if (activeFlow == null) {
      textView.text = ""
      suppressSelection = false
      requestLayout()
      return
    }
    val content = SpannableString(activeFlow.text)
    fun apply(span: Any, range: TextRange) {
      content.setSpan(span, range.start, range.end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    }
    if (content.isNotEmpty()) {
      apply(ParagraphHeightSpan(TextRange(0, content.length), px(config.lineHeight), 0, 0), TextRange(0, content.length))
    }
    for (spec in activeFlow.spans) {
      val range = spec.range(content.length) ?: continue
      when (spec.optString("kind")) {
        "strong" -> apply(StyleSpan(Typeface.BOLD), range)
        "emphasis" -> apply(StyleSpan(Typeface.ITALIC), range)
        "underline" -> apply(UnderlineSpan(), range)
        "strikethrough" -> apply(StrikethroughSpan(), range)
        "highlight" -> apply(BackgroundColorSpan(parseColor(spec.optString("color"), 0x33f4c542)), range)
        "subscript" -> apply(ScriptSpan(false), range)
        "superscript" -> apply(ScriptSpan(true), range)
        "code" -> {
          apply(MonoSpan(), range)
          apply(BackgroundColorSpan((config.secondaryColor and 0x00ffffff) or 0x16000000), range)
        }
        "link" -> {
          apply(ForegroundColorSpan(parseColor(spec.optString("color"), config.linkColor)), range)
          apply(UnderlineSpan(), range)
        }
      }
    }
    for ((index, spec) in activeFlow.paragraphs.withIndex()) {
      val range = spec.range(content.length) ?: continue
      val kind = spec.optString("kind")
      val headingScale = when (spec.optInt("level", 2)) { 1 -> 1.55f; 2 -> 1.35f; else -> 1.15f }
      var lineHeight = config.lineHeight
      when (kind) {
        "heading" -> {
          // The compiler supplies the same heading metrics as the other backends.
          // Retain the original heuristic only for flows created by older clients.
          val headingFontSize = spec.optDouble("fontSize", Double.NaN).toFloat()
            .takeIf { it.isFinite() && it > 0f } ?: config.fontSize * headingScale
          apply(RelativeSizeSpan(headingFontSize / config.fontSize), range)
          apply(StyleSpan(Typeface.BOLD), range)
          lineHeight = spec.optDouble("lineHeight", Double.NaN).toFloat()
            .takeIf { it.isFinite() && it > 0f } ?: max(config.lineHeight, headingFontSize * 1.45f)
        }
        "quote" -> {
          apply(QuoteMarginSpan(config.secondaryColor, px(2f), px(10f)), range)
          apply(ForegroundColorSpan(config.secondaryColor), range)
        }
        "listItem" -> apply(LeadingMarginSpan.Standard(px(spec.optDouble("indent", 18.0).toFloat())), range)
        "code" -> {
          apply(MonoSpan(), range)
          apply(RelativeSizeSpan(0.9f), range)
          apply(BackgroundColorSpan((config.secondaryColor and 0x00ffffff) or 0x16000000), range)
        }
      }
      val marginTop = spec.optDouble("marginTop", if (kind == "heading" && index > 0) 8.0 else 0.0).toFloat()
      val marginBottom = spec.optDouble("marginBottom", if (index < activeFlow.paragraphs.lastIndex) config.paragraphSpacing.toDouble() else 0.0).toFloat()
      apply(ParagraphHeightSpan(range, px(lineHeight), px(marginTop), px(marginBottom)), range)
    }
    val maxAttachmentWidth = max(1f, if (contentWidthPx > 0) contentWidthPx.toFloat() else resources.displayMetrics.widthPixels.toFloat())
    val fontPx = config.fontSize * textScale
    val pending = mutableListOf<Pair<JSONObject, InlineAttachmentSpan>>()
    for (spec in activeFlow.attachments) {
      val range = spec.range(content.length) ?: continue
      if (range.end - range.start != 1 || content[range.start] != '\ufffc') continue
      val span = InlineAttachmentSpan(spec, textScale, fontPx, maxAttachmentWidth, config.secondaryColor, config.textColor)
      val key = assetKey(spec, fontPx, maxAttachmentWidth)
      val cachedAsset = ProcessAttachmentRequests.cached(key)
      cachedAsset?.let { span.setAsset(it) }
      apply(span, range)
      if (cachedAsset == null && spec.optString("url").isNotBlank()) pending.add(spec to span)
    }
    textView.setText(content, android.widget.TextView.BufferType.SPANNABLE)
    if (oldFlow != null && oldFlow.id == activeFlow.id && oldFlow.textVersion == activeFlow.textVersion && selectedStart >= 0 && selectedEnd >= 0) {
      (textView.text as? Spannable)?.let {
        Selection.setSelection(it, selectedStart.coerceAtMost(it.length), selectedEnd.coerceAtMost(it.length))
      }
    }
    suppressSelection = false
    emitSelection(textView.selectionStart, textView.selectionEnd)
    requestLayout()
    post { if (!disposed && generation == currentGeneration) measureText() }
    for ((spec, span) in pending) {
      val scale = textScale
      val key = assetKey(spec, fontPx, maxAttachmentWidth)
      requests.add(ProcessAttachmentRequests.subscribe(key, spec, scale, fontPx, maxAttachmentWidth) { asset ->
        if (asset == null) return@subscribe
        post {
          if (!disposed && generation == currentGeneration) {
            attachmentUpdates.add(AttachmentUpdate(currentGeneration, span, asset))
            if (!attachmentFrameScheduled) {
              attachmentFrameScheduled = true
              postOnAnimation(attachmentFrame)
            }
          }
        }
      })
    }
  }

  private fun applyAttachmentUpdates() {
    attachmentFrameScheduled = false
    val updates = attachmentUpdates.filter { it.generation == generation }
    attachmentUpdates.clear()
    if (disposed || updates.isEmpty()) return
    for (update in updates) update.span.setAsset(update.asset)
    // All completions received during this frame update the layout once, retaining selection.
    // Mutating ReplacementSpan metrics alone does not invalidate TextView's cached Layout.
    val start = textView.selectionStart
    val end = textView.selectionEnd
    suppressSelection = true
    textView.setText(SpannableString(textView.text), android.widget.TextView.BufferType.SPANNABLE)
    if (start >= 0 && end >= 0) {
      (textView.text as? Spannable)?.let {
        Selection.setSelection(it, start.coerceAtMost(it.length), end.coerceAtMost(it.length))
      }
    }
    suppressSelection = false
    textView.requestLayout()
    textView.invalidate()
    requestLayout()
    measureText()
  }

  private fun measureText() {
    if (disposed) return
    val desiredWidth = if (contentWidthPx > 0) contentWidthPx else max(1, measuredWidth)
    textView.measure(View.MeasureSpec.makeMeasureSpec(desiredWidth, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED))
    measuredTextHeight = textView.measuredHeight
    val activeFlow = flow ?: return
    val currentLayoutKey = layoutKey
    val currentGeneration = generation
    val key = "${activeFlow.id}:${activeFlow.textVersion}:$currentLayoutKey:$measuredTextHeight"
    if (key == lastHeightKey) return
    lastHeightKey = key
    val event = HeightEvent(activeFlow.id, activeFlow.textVersion, currentLayoutKey, measuredTextHeight / density.toDouble())
    post {
      if (!disposed && generation == currentGeneration && layoutKey == currentLayoutKey && lastHeightKey == key) {
        onHeightChange(event)
      }
    }
  }

  private fun emitSelection(start: Int, end: Int) {
    if (disposed || suppressSelection) return
    val activeFlow = flow ?: return
    val normalizedStart = if (start < 0 || end < 0 || start == end) -1 else min(start, end)
    val normalizedEnd = if (normalizedStart < 0) -1 else max(start, end)
    val key = "${activeFlow.id}:${activeFlow.textVersion}:$normalizedStart:$normalizedEnd"
    if (key == lastSelectionKey) return
    lastSelectionKey = key
    onSelectionChange(SelectionEvent(activeFlow.id, activeFlow.textVersion, normalizedStart, normalizedEnd))
  }

  private fun emitAction(spec: JSONObject, kind: String) {
    val activeFlow = flow ?: return
    val range = spec.range(activeFlow.text.length) ?: return
    val id = when (kind) {
      "link" -> spec.optString("nodeId")
      "segment" -> spec.optString("actionId", spec.optString("id"))
      else -> spec.optString("id")
    }
    val url = spec.optString("url").takeIf { it.isNotBlank() }
    onAction(ActionEvent(activeFlow.id, activeFlow.textVersion, kind, id, range.start, range.end, url))
  }

  private fun copyText(start: Int, end: Int): String {
    val activeFlow = flow ?: return ""
    val lower = start.coerceIn(0, activeFlow.text.length)
    val upper = end.coerceIn(lower, activeFlow.text.length)
    val result = StringBuilder()
    var cursor = lower
    for (attachment in activeFlow.attachments.sortedBy { it.optInt("start") }) {
      val range = attachment.range(activeFlow.text.length) ?: continue
      if (!range.intersects(lower, upper) || range.start < cursor) continue
      result.append(activeFlow.text.substring(cursor, range.start))
      result.append(attachment.optString("copyText", attachment.optString("latex", attachment.optString("alt", ""))))
      cursor = min(upper, range.end)
    }
    result.append(activeFlow.text.substring(cursor, upper))
    return result.toString()
  }

  private fun px(dp: Float): Int = ceil(dp.coerceAtLeast(0f) * textScale).toInt()
  private fun assetKey(spec: JSONObject, fontPx: Float, maxWidth: Float): String = "${spec.optString("kind")}|${spec.optString("url")}|${spec.optDouble("width")}|${spec.optDouble("height")}|$fontPx|$maxWidth|$textScale"
}
