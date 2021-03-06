const {
  getPHPSESSID,
  login,
  selectClass,
  selectSeat,
  checkSeatNum,
  getSetInfo,
  getRoomInfo,
  checkSeat,
  SignOutSeat
} = require('../api')

class Run {
  constructor ({PHPSESSID = '', username = '', passwd = '', roomId = '', seatNum = ''}) {
    this.PHPSESSID = PHPSESSID,
    this.username = username,
    this.passwd = passwd,
    this.roomId = roomId-1,
    this.seatNum = String(seatNum)

    // 其他属性
    this.roomState = []
    this.trueNum = null
    this.SateInfo = []
    this.notWrite = false
  }
  async run () {
    console.log(Date.now())
    this.PHPSESSID = await this._getCookie()
    if (await this._login() !== 'success') {
      console.log('登陆失败')
      return
    }
    let state = await this._checkSeat()
    state = JSON.parse(state)
    if (!(state.label === "fail")) {
      console.log('你已经处于约座状态了')
      return state
    }

    let roomState = await this._roomState()
    roomState = JSON.parse(roomState)
    await roomState.rows.forEach(item => {
      this.roomState.push({open_status: item.open_status, bespeak_status: item.bespeak_status})
    });
    if (this.roomState[Number(this.roomId)].open_status !== '1'
        && this.roomState[Number(this.roomId)].bespeak_status !== '1') {
          console.log('你选择的房间关闭, 我们将为你更换可用房间')
          this.roomState.splice(Number(this.roomId), 1)
          let roomId = await this._selectCanUseRoom()
          if (roomId === 'null') {
            console.log('所有房间都是关闭的')
            return
          }
    }
    console.log(`当前房间号${this.roomId}`)
    await this._selectRoom(this.roomId + 1)
    while (await this._checkCanUseRoomNum(this) <= 0 && this.roomState.length >= 0) {
      console.log('座位已经被选完了, 我将为你在换换房间')
      await this._selectCanUseRoom(this.roomId)
    }
    console.log('有多于的位置,那是你的')
    let SateInfo = await this._getSateInfo()
    SateInfo = JSON.parse(SateInfo)
    this.trueNum = SateInfo.total
    if (!(this.seatNum > SateInfo.rows.length)) {
      if (this.checkState(SateInfo.rows[Number(this.seatNum)])) {
        let result = await this._selectSeat()
        let flag = await this.stateResultCheck(result)
        console.log(flag)
        if (flag === 0 || flag === 1) return
      }
    }
    console.log('你选择的位置被占了或者不存在')
    await this._deaWithState(SateInfo.rows)
    console.log('心爱的位置已经被约了, 那我将大量大量的去约其他座位了')
    let flagArray = await this._randomTen()
    let stateResult = await this._concurrency(flagArray)
    let i = 1
    console.log(`正在进行第${i * 10}请求尝试`)
    while (stateResult && this.SateInfo.length >= 10) {
      i++
      console.log(`正在进行第${i * 10}请求尝试`)
      flagArray = await this._randomTen()
      stateResult = await this._concurrency(flagArray)
    }
  }
  
  _randomTen () {
    let flag = []
    new Array(10).fill(0).forEach(() => {
      let less = this.SateInfo.splice((Math.floor(Math.random() * this.SateInfo.length)), 1)[0]
      flag.push(less)
    })
    return flag
  }

  async _concurrency (array) {
    let flag = false
    const promises = array.map((item) => {
      return this._selectSeat(item.seat_sn)
    })
    await Promise.all(promises).then(async (result) => {
      let flagArray = []
      await result.forEach(async(item) => {
        flagArray.push(await this.stateResultCheck(item))
      })
      if (flagArray.every((item) => item === '2')) {
        flag = true
      }
    })
    return flag
  }

  stateResultCheck (result) {
    result = JSON.parse(result)
    if (result.label === 'bespeak_success') {
      console.log('约座成功')
      return 1
    } else if (result.label === 'overtime' 
      || result.label === 'all_bespeak_stop'
      || result.label === 'violations_times'
      || result.label === 'room_close'
      || result.label === 'bespeak_close'
      || result.label === '') {
      console.log('BUG约不到')
      return 0
    } else if (result.label === 'already_bespeaked') {
      console.log('已经预约过了')
      return 0
    } else if (result.label === 'seat_used') {
      console.log('座位被占了, 我帮你约约其他的')
      return 2
    }
  }

  checkState (less) {
    let {use_status, bespeak0, bespeak1, bespeak2, bespeak3, bespeak4, bespeak5, bespeak6} = less
    if (Number(use_status) && !Number(bespeak0)
      && !Number(bespeak1) && !Number(bespeak2)
      && !Number(bespeak3) && !Number(bespeak4)
      && !Number(bespeak5) && !Number(bespeak6)) {
      return true
    }
    return false
  }

  async _deaWithState (less) {
    less.forEach((item, i) => {
      if (i > this.trueNum) return
      if (this.checkState(item)) {
        this.SateInfo.push(item)
      }
    })
  }

  async _checkCanUseRoomNum (that) {
    let checkRoomNum = await that._checkRoomNum()
    checkRoomNum = JSON.parse(checkRoomNum)
    return parseInt(checkRoomNum.allNoNum)
  }

  _selectCanUseRoom (u) {
    if (u) this.roomState.splice(u, 1)
    let remove = []
    this.roomState.forEach((item, i) => {
      if (item.open_status !== '1' || item.bespeak_status !== '1') {
        remove.push(i)
      }
    })
    let flag = remove.sort((x, y) => y - x).shift()
    while (flag) {
      this.roomState.splice(flag, 1)
      flag = remove.shift()
    }
    if (this.roomState.length <= 0) return 'null'
    this.roomId = Math.floor(Math.random() * this.roomState.length)
    return 1
  }

  // 获取Cookie
  async _getCookie () {
    return await getPHPSESSID()
  }

  // 登陆
  async _login () {
    const {username, passwd} = this
    return await login({username, passwd, PHPSESSID: this.PHPSESSID})
  }

  // 获取房间状态
  async _roomState () {
    return await getRoomInfo({PHPSESSID: this.PHPSESSID})
  }

  // 选择房间
  async _selectRoom (roomId) {
    if (!roomId) roomId = this.roomId
    return await selectClass({roomId, PHPSESSID: this.PHPSESSID})
  }

  // 查看房间座位可用数量
  async _checkRoomNum () {
    return await checkSeatNum({PHPSESSID: this.PHPSESSID})
  }

  // 获取房间座位的状态和数目
  async _getSateInfo () {
    return await getSetInfo({PHPSESSID: this.PHPSESSID})
  }

  // 选择座位
  async _selectSeat (seatNum) {
    if (!seatNum) seatNum = this.seatNum
    return await selectSeat({seatNum, PHPSESSID: this.PHPSESSID})
  }
  
  // 查看选择座位后的情况
  async _checkSeat() {
    return await checkSeat({PHPSESSID: this.PHPSESSID})
  }

  // 登出
  async _signOutSeat() {
    return await SignOutSeat({PHPSESSID: this.PHPSESSID})
  }
}

module.exports = {
  Run
}