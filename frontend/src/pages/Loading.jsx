import React from 'react'
import { Spinner } from '@nextui-org/react';
const Loading = ({text}) => {
    return (
        <div className="flex w-full h-full justify-center items-center">
            <div className="flex flex-col justify-center items-center text-center">       
                <Spinner size="lg" color='blue' />
                <span className="text-lg font-medium font-poppins mt-5">{text}</span>
            </div>
        </div>
    )
}

export default Loading