const fs = require('node:fs')

// Bun's tty stream closes the PTY on EAGAIN; retry reads without closing the master.
exports.createReadStream = (fd) => {
  let stream
  stream = fs.createReadStream(null, {
    fd,
    autoClose: true,
    fs: {
      close: fs.close,
      read(fd, buffer, offset, length, position, callback) {
        const read = () => {
          if (stream.destroyed) return callback(null, 0, buffer)
          fs.read(fd, buffer, offset, length, position, (error, bytesRead, data) => {
            if (error?.code === 'EAGAIN') return setTimeout(read, 10)
            callback(error, bytesRead, data)
          })
        }
        read()
      },
    },
  })
  return stream
}
