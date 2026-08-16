const { firestoreAdmin, getAuthenticatedUser } = require('./_firebaseAdmin');

function toMinutes(hhmm) {
  const [h, m] = String(hhmm || '00:00').split(':').map(Number);
  return h * 60 + m;
}

// Current East Africa Time (UTC+3, no DST) minute-of-day, computed from
// the server's own clock -- never trusts anything client-supplied for
// the time check, so it can't be defeated by changing a device's system
// clock. Kenya's offset is fixed, so no timezone library is needed.
function nowEatMinutes() {
  const utcMinutes = (Date.now() / 60000) % 1440;
  return (utcMinutes + 180 + 1440) % 1440;
}

// Employee-only login time-window/geofence enforcement -- mirrors
// check_login_security() from the old schema. Deliberately never blocks
// the business owner's own login: only the owner can reach Settings to
// configure or disable these, so blocking the owner too would risk a
// permanent self-lockout with no way back in (unlike the platform-admin
// block feature, which explicitly guards against that same class of
// mistake for admin accounts).
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (user.role !== 'employee' || !user.ownerUserId) {
    res.status(200).json({ allowed: true, reason: null });
    return;
  }

  const settingsSnap = await firestoreAdmin.collection('businesses').doc(user.ownerUserId).collection('settings').doc('main').get();
  if (!settingsSnap.exists) {
    res.status(200).json({ allowed: true, reason: null });
    return;
  }
  const settings = settingsSnap.data();

  if (settings.loginWindowEnabled) {
    const nowMin = nowEatMinutes();
    const startMin = toMinutes(settings.loginWindowStart);
    const endMin = toMinutes(settings.loginWindowEnd);
    const inWindow = startMin <= endMin
      ? nowMin >= startMin && nowMin <= endMin
      : nowMin >= startMin || nowMin <= endMin;
    if (!inWindow) {
      res.status(200).json({
        allowed: false,
        reason: `Logins are only allowed between ${settings.loginWindowStart} and ${settings.loginWindowEnd} (East Africa Time).`
      });
      return;
    }
  }

  if (settings.loginGeofenceEnabled) {
    const { latitude, longitude, locationStatus } = req.body || {};
    if (locationStatus !== 'granted' || latitude == null || longitude == null) {
      res.status(200).json({
        allowed: false,
        reason: 'This business requires your device location to log in, and it was not available. Enable location access in your browser and try again.'
      });
      return;
    }

    const toRad = d => (d * Math.PI) / 180;
    const lat1 = toRad(settings.loginGeofenceLatitude);
    const lat2 = toRad(latitude);
    const dLng = toRad(longitude - settings.loginGeofenceLongitude);
    const cosArg = Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(dLng);
    const distanceM = 6371000 * Math.acos(Math.max(-1, Math.min(1, cosArg)));

    if (distanceM > settings.loginGeofenceRadiusMeters) {
      res.status(200).json({
        allowed: false,
        reason: `You are outside the allowed login area for this business (${Math.round(distanceM)} m away, ${Math.round(settings.loginGeofenceRadiusMeters)} m allowed).`
      });
      return;
    }
  }

  res.status(200).json({ allowed: true, reason: null });
};
