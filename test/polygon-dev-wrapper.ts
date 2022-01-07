import { expect } from 'chai'
import { ethers, upgrades } from 'hardhat'

describe('PolygonDevWrapper', () => {
	const DUMMY_MINT_AMOUNT = 10 ** 8

	before(async function () {
		this.Dev = await ethers.getContractFactory('PolygonDevWrapper')
		this.ErcDummy = await ethers.getContractFactory('DummyDev')
	})

	beforeEach(async function () {
		const [user1] = await ethers.getSigners()
		this.ercDummy = await this.ErcDummy.deploy(
			ethers.BigNumber.from(DUMMY_MINT_AMOUNT),
			user1.address
		)

		await this.ercDummy.deployed()

		this.dev = await upgrades.deployProxy(this.Dev, [this.ercDummy.address], {
			unsafeAllow: ['delegatecall'],
			initializer: '__init',
		})
		await this.dev.deployed()
		await this.ercDummy.grantRole(
			'0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6',
			this.dev.address
		)
	})

	it('Should initialize values', async function () {
		expect(await this.dev.name()).to.equal('Polygon Dev Wrapper')
		expect(await this.dev.symbol()).to.equal('WDEV')
		expect(await this.dev.devAddress()).to.equal(this.ercDummy.address)
	})

	describe('Wrap', () => {
		it('Should successfully wrap DEV', async function () {
			const [user] = await ethers.getSigners()
			const wrapAmount = 100

			expect(await this.dev.balanceOf(user.address)).to.eq(0)
			expect(await this.ercDummy.balanceOf(user.address)).to.eq(
				DUMMY_MINT_AMOUNT
			)
			expect(await this.ercDummy.balanceOf(this.dev.address)).to.eq(0)

			await this.ercDummy.approve(this.dev.address, wrapAmount)
			await this.dev.wrap(wrapAmount)

			expect(await this.dev.balanceOf(user.address)).to.eq(wrapAmount)
			expect(await this.ercDummy.balanceOf(user.address)).to.eq(
				DUMMY_MINT_AMOUNT - wrapAmount
			)
			expect(await this.ercDummy.balanceOf(this.dev.address)).to.eq(wrapAmount)
		})
		it('Should fail wrapping due to insufficient DEV balance', async function () {
			const [, user2] = await ethers.getSigners()
			this.ercDummy.connect(user2).approve(this.dev.address, 100)

			expect(this.dev.connect(user2).wrap(100)).to.be.revertedWith(
				'Insufficient balance'
			)
		})
	})

	describe('Unwrap', () => {
		it('Should successfully unwrap DEV', async function () {
			const [user] = await ethers.getSigners()
			const wrapAmount = 100

			const wrapping = async () => {
				await this.ercDummy.approve(this.dev.address, wrapAmount)
				await this.dev.wrap(wrapAmount)
				expect(await this.dev.balanceOf(user.address)).to.eq(wrapAmount)
			}

			await wrapping()

			await this.dev.unwrap(wrapAmount)

			expect(await this.dev.balanceOf(user.address)).to.eq(0)
			expect(await this.ercDummy.balanceOf(user.address)).to.eq(
				DUMMY_MINT_AMOUNT
			)
			expect(await this.ercDummy.balanceOf(this.dev.address)).to.eq(0)
		})
		it('Should successfully mint DEV when unwrapping DEV', async function () {
			const [, user1] = await ethers.getSigners()
			const wrapAmount = 100

			const prepare = async () => {
				await this.dev.mint(user1.address, wrapAmount)
				expect(await this.dev.balanceOf(user1.address)).to.eq(wrapAmount)
				expect(await this.ercDummy.balanceOf(this.dev.address)).to.eq(0)
			}

			await prepare()

			await this.dev.connect(user1).unwrap(wrapAmount)

			expect(await this.dev.balanceOf(user1.address)).to.eq(0)
			expect(await this.ercDummy.balanceOf(user1.address)).to.eq(wrapAmount)
			expect(await this.ercDummy.totalSupply()).to.eq(
				wrapAmount + DUMMY_MINT_AMOUNT
			)
		})
		it('Should fail unwrapping due to insufficient pegged DEV funds', async function () {
			expect(this.dev.unwrap(1000)).to.be.revertedWith('Insufficient balance')
		})
	})

	describe('transferDev', () => {
		it('Should successfully transferDev', async function () {
			const [user] = await ethers.getSigners()
			const amount = 100

			const prev = await this.ercDummy.balanceOf(user.address)

			await this.ercDummy.transfer(this.dev.address, amount)

			await this.dev.transferDev()

			expect(await this.ercDummy.balanceOf(user.address)).to.eq(prev)
		})
		it('Should fail transferDev when the sender is not owner', async function () {
			const [, user1] = await ethers.getSigners()
			const amount = 100

			await this.ercDummy.transfer(this.dev.address, amount)

			expect(this.dev.connect(user1).transferDev()).to.be.revertedWith(
				'Ownable: caller is not the owner'
			)
		})
	})
})
