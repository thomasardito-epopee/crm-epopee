exports.handler = function (_event, _context, callback) {
  callback(null, { statusCode: 200, body: 'pong' });
};
