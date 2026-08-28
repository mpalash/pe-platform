/**
 * Whether the archive's content warning has been accepted.
 *
 * Shared state rather than a local ref because two things need the answer: the
 * modal that asks, and the archive behind it, which loads while the warning is
 * up but must not start PLAYING anything until it comes down.
 *
 * Not persisted, deliberately. Consent to see documented violence is given for
 * a visit, not banked against every future one — and re-reading a content
 * warning costs a click, which is the cheap side of that trade.
 */
export function useArchiveAdvisory() {
  const accepted = useState('archive:advisoryAccepted', () => false)

  return {
    accepted,
    accept: () => { accepted.value = true },
  }
}
