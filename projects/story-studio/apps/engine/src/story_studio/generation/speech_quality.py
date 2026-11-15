"""Bounded speech segments and text coverage checks, independent of model libraries."""
from difflib import SequenceMatcher
import re
import unicodedata


def _sino_number(number):
    if number == 0:
        return '영'
    digits = '영일이삼사오육칠팔구'
    if number >= 100_000_000:
        return ''.join(digits[int(char)] for char in str(number))
    if number >= 10_000:
        upper, lower = divmod(number, 10_000)
        return ('' if upper == 1 else _sino_number(upper)) + '만' + (_sino_number(lower) if lower else '')
    parts = []
    for value, unit in [(1000, '천'), (100, '백'), (10, '십'), (1, '')]:
        digit, number = divmod(number, value)
        if digit:
            parts.append(('' if digit == 1 and unit else digits[digit]) + unit)
    return ''.join(parts)


def _native_count(number):
    if not 0 < number < 100:
        return _sino_number(number)
    ones = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉']
    tens = ['', '열', '스물', '서른', '마흔', '쉰', '예순', '일흔', '여든', '아흔']
    return '스무' if number == 20 else tens[number // 10] + ones[number % 10]


def _spoken_number(match):
    number = match.group()
    if '.' in number:
        whole, decimal = number.split('.')
        return _sino_number(int(whole)) + '점' + ''.join(_sino_number(int(char)) for char in decimal)
    remainder = match.string[match.end():].lstrip()
    if re.match(r'(?:시(?!즌)|명|마리|개|살|잔|권|병)', remainder):
        return _native_count(int(number))
    return _sino_number(int(number))


def _clock_reading(hour, minute):
    hours = _native_count(hour) if 1 <= hour <= 12 else _sino_number(hour)
    return hours + ' 시 ' + (_sino_number(minute) + ' 분' if minute else '정각')


def normalized_text(text):
    text = unicodedata.normalize('NFKC', text).casefold()
    for word, pronunciation in [('ai', '에이아이'), ('api', '에이피아이'), ('tts', '티티에스'), ('llm', '엘엘엠')]:
        text = re.sub(r'(?<![a-z])' + word + r'(?![a-z])', pronunciation, text)
    text = re.sub(r'(?<!\d)(\d{1,2}):(\d{2})(?!\d)', lambda match: _clock_reading(int(match[1]), int(match[2])), text)
    text = re.sub(r'(?<=\d),(?=\d{3}(?:\D|$))', '', text)
    text = re.sub(r'\d+(?:\.\d+)?', _spoken_number, text)
    return ''.join(char for char in text if char.isalnum())


def spoken_text(text):
    # Remove dialogue labels without consuming a time such as "오후 3:30".
    text = re.sub(r'(?m)^[^\d\n:]{1,24}:\s*', '', text).strip()
    # A colon was skipped by the TTS model in real generation. Expand explicitly
    # marked clock times; leave ambiguous duration/ratio strings untouched.
    return re.sub(r'(오전|오후)\s*(\d{1,2}):(\d{2})(?!\d)', lambda match: match[1] + ' ' + _clock_reading(int(match[2]), int(match[3])), text)


def sentences(text):
    return [part.strip() for part in re.split(r'(?<=[.!?。！？])\s+|\n+', text) if part.strip()]


def speech_segments(text, limit=160):
    parts = []
    current = ''
    for sentence in sentences(text):
        while len(sentence) > limit:
            if current:
                parts.append(current)
                current = ''
            cut = sentence.rfind(' ', 0, limit + 1)
            cut = cut if cut > 0 else limit
            parts.append(sentence[:cut].strip())
            sentence = sentence[cut:].strip()
        joined = (current + ' ' + sentence).strip()
        if current and len(joined) > limit:
            parts.append(current)
            current = sentence
        else:
            current = joined
    if current:
        parts.append(current)
    return parts


def transcript_matches(expected, actual):
    target, recognized = normalized_text(expected), normalized_text(actual)
    if not target or not recognized:
        return False
    previous = list(range(len(recognized) + 1))
    for index, char in enumerate(target, 1):
        current = [index]
        for other, candidate in enumerate(recognized, 1):
            current.append(min(current[-1] + 1, previous[other] + 1, previous[other - 1] + (char != candidate)))
        previous = current
    if previous[-1] / len(target) > .12 or len(recognized) / len(target) < .9:
        return False
    blocks = SequenceMatcher(None, target, recognized, autojunk=False).get_matching_blocks()
    offset = 0
    for sentence in sentences(expected):
        length = len(normalized_text(sentence))
        if not length:
            continue
        matched = sum(max(0, min(offset + length, block.a + block.size) - max(offset, block.a)) for block in blocks)
        if matched / length < .8:
            return False
        offset += length
    return True
